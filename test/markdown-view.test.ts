import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import {
  MARKDOWN_VENDOR_ASSETS,
  renderMarkdownDocument,
} from "../src/server/markdown-view.js";
import { SessionStore } from "../src/server/session.js";
import { extractTitle } from "../src/server/session-files.js";
import {
  createImportedEntries,
  SessionImportValidationError,
} from "../src/server/session-import.js";
import { viewableKind } from "../src/server/viewable-file.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-markdown-"));
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

function parse(html: string): Document {
  return new JSDOM(html).window.document;
}

describe("Markdown viewing", () => {
  test("拡張子でHTMLとMarkdownを判別し、ほかの形式は表示対象にしない", () => {
    expect(viewableKind("/a/page.HTML")).toBe("html");
    expect(viewableKind("/a/page.htm")).toBe("html");
    expect(viewableKind("/a/note.md")).toBe("markdown");
    expect(viewableKind("/a/note.Markdown")).toBe("markdown");
    expect(viewableKind("/a/data.txt")).toBeNull();
    expect(viewableKind("/a/README")).toBeNull();
  });

  test("Markdownのタイトルはコードブロック外の最初のH1、なければファイル名", async () => {
    const titled = path.join(dir, "titled.md");
    await writeFile(
      titled,
      "```md\n# コード内\n```\n\n## 小見出し\n\n#   設計   メモ  ##\n\n# 二つ目\n",
    );
    const untitled = path.join(dir, "untitled.markdown");
    await writeFile(untitled, "本文だけ\n\n~~~\n# フェンス内\n~~~\n");

    await expect(extractTitle(titled)).resolves.toBe("設計 メモ");
    await expect(extractTitle(untitled)).resolves.toBe("untitled.markdown");
  });

  test("GFMと埋め込みHTMLを表示し、Mermaidは図の要素と描画処理を出力する", () => {
    const html = renderMarkdownDocument(
      [
        "# 見出し",
        "",
        "| a | b |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "- [x] done",
        "",
        "![図](img/box.svg) [次へ](next.md)",
        "",
        "<details><summary>詳細</summary>中身</details>",
        "",
        "```mermaid",
        "flowchart LR",
        '  A["<b>開始</b>"] --> B',
        "```",
        "",
        "```js",
        "const x = 1;",
        "```",
      ].join("\n"),
      'Title <"&>',
    );
    const document = parse(html);

    expect(document.title).toBe('Title <"&>');
    expect(
      document.querySelector("article.markdown-body h1")?.textContent,
    ).toBe("見出し");
    expect(document.querySelectorAll("table td")).toHaveLength(2);
    expect(
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(true);
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "img/box.svg",
    );
    expect(document.querySelector("a")?.getAttribute("href")).toBe("next.md");
    expect(document.querySelector("details summary")?.textContent).toBe("詳細");
    const diagram = document.querySelector("pre.mermaid");
    expect(diagram?.textContent).toBe('flowchart LR\n  A["<b>開始</b>"] --> B');
    expect(diagram?.children).toHaveLength(0);
    expect(document.querySelector("code.language-js")?.textContent).toBe(
      "const x = 1;\n",
    );
    expect(
      [...document.querySelectorAll("link[rel=stylesheet]")].map((link) => [
        link.getAttribute("href"),
        link.getAttribute("media"),
      ]),
    ).toEqual([
      [MARKDOWN_VENDOR_ASSETS.lightTheme, "(prefers-color-scheme: light)"],
      [MARKDOWN_VENDOR_ASSETS.darkTheme, "(prefers-color-scheme: dark)"],
    ]);
    expect(
      document.querySelector(`script[src="${MARKDOWN_VENDOR_ASSETS.mermaid}"]`),
    ).not.toBeNull();
  });

  test("Mermaidがない文書は描画処理を読み込まない", () => {
    const document = parse(renderMarkdownDocument("本文\n", "Plain"));

    expect(document.querySelector("script")).toBeNull();
  });

  test("JSON復元はMarkdownを受け付け、表示できない形式を拒否する", async () => {
    const note = path.join(dir, "note.md");
    const text = path.join(dir, "note.txt");
    await writeFile(note, "# Note\n");
    await writeFile(text, "text\n");

    const [entry] = await createImportedEntries([note], extractTitle);
    expect(entry).toMatchObject({ absPath: note, title: "Note" });
    await expect(
      createImportedEntries([text], extractTitle),
    ).rejects.toBeInstanceOf(SessionImportValidationError);
  });

  test("閲覧ルートはMarkdownを変換し、HTMLと相対アセットは従来どおり返す", async () => {
    const store = new SessionStore(path.join(dir, "session.json"));
    await store.load();
    const note = path.join(dir, "note.md");
    const page = path.join(dir, "page.html");
    await writeFile(note, "# Note\n\n[link](other.md)\n");
    await writeFile(page, "<title>Page</title><p>raw</p>");
    await writeFile(path.join(dir, "other.md"), "# Other\n");
    const [noteEntry, pageEntry] = await store.addEntries([note, page]);
    const app = await createApp({ sessionStore: store });

    const rendered = await app.inject({ url: `/f/${noteEntry.id}/` });
    expect(rendered.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(parse(rendered.body).querySelector("h1")?.textContent).toBe("Note");
    const raw = await app.inject({ url: `/f/${pageEntry.id}/` });
    expect(raw.body).toBe("<title>Page</title><p>raw</p>");
    const linked = await app.inject({ url: `/f/${noteEntry.id}/other.md` });
    expect(linked.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(linked.body).toBe("# Other\n");
    await app.close();
  });
});
