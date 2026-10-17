// @vitest-environment jsdom
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const DOCS_ROOT = path.resolve("src/web/public/docs");
const LOCALES = ["en", "ja"] as const;
const SLUGS = [
  "getting-started",
  "cli",
  "api",
  "gui-api-mapping",
] as const;
const RPC_OPERATIONS = [
  "server.health",
  "server.shutdown",
  "session.get",
  "session.add",
  "session.setFavorite",
  "session.reorder",
  "session.removeMany",
  "session.remove",
  "session.clear",
  "session.import",
  "session.export",
  "session.pickFiles",
  "session.pickDirectory",
  "workspaces.list",
  "workspaces.create",
  "workspaces.activate",
  "workspaces.rename",
  "workspaces.delete",
  "agentContext.get",
  "agentContext.set",
  "search.query",
] as const;
const HTTP_OPERATIONS = [
  "POST /rpc",
  "GET /",
  "GET /manifest.webmanifest",
  "GET /assets/*",
  "GET /docs/*",
  "GET /f/:id/",
  "GET /f/:id/*",
  "WS /ws",
] as const;
const GUI_OPERATIONS = [
  "session.get",
  "GET /f/:id/",
  "GET /docs/*",
  "WS /ws",
  "search.query",
  "session.pickFiles",
  "session.pickDirectory",
  "session.reorder",
  "session.remove",
  "session.removeMany",
  "session.clear",
  "session.import",
  "session.export",
  "agentContext.set",
  "session.setFavorite",
  "workspaces.create",
  "workspaces.activate",
  "workspaces.rename",
  "workspaces.delete",
] as const;

describe("組み込みドキュメント本文", () => {
  test("英語と日本語に同じ4ページがそろう", async () => {
    for (const locale of LOCALES) {
      const fileNames = (await readdir(path.join(DOCS_ROOT, locale)))
        .filter((fileName) => fileName.endsWith(".html"))
        .sort();
      expect(fileNames).toEqual(SLUGS.map((slug) => `${slug}.html`).sort());
    }
  });

  test("各ページが外部依存のない読みやすいHTML文書である", async () => {
    for (const locale of LOCALES) {
      for (const slug of SLUGS) {
        const html = await readDoc(locale, slug);
        expect(html).toMatch(/^<!doctype html>/i);
        expect(html).toContain(`<html lang="${locale}">`);
        expect(html).toMatch(/<title>[^<]+ \| zatto<\/title>/);
        expect(html).toContain('name="viewport"');
        expect(html).toContain("<main");
        expect(html).toContain("<style>");
        const document = new DOMParser().parseFromString(html, "text/html");
        expect(
          document.querySelector(
            "script, link, img, iframe, object, embed, audio, video, source, meta[http-equiv]",
          ),
        ).toBeNull();
        expect(document.querySelector("[src], [srcset], [poster]")).toBeNull();
        for (const style of document.querySelectorAll("style")) {
          expect(style.textContent).not.toMatch(/url\s*\(|@import/i);
        }
        for (const anchor of document.querySelectorAll("a[href]")) {
          const href = anchor.getAttribute("href") ?? "";
          const target = new URL(href, "https://zatto.invalid/");
          expect(target.protocol).toBe("https:");
          expect(target.username).toBe("");
          expect(target.password).toBe("");
        }
        expect(html).not.toMatch(/(?:\/Users\/|[A-Z]:\\|Figma)/i);
      }
    }
  });

  test("APIページが全21 RPC methodsと保持するHTTP/WS配信を記載する", async () => {
    expect(RPC_OPERATIONS).toHaveLength(21);
    for (const locale of LOCALES) {
      const html = await readDoc(locale, "api");
      const codeValues = readCodeValues(html);
      for (const operation of [...RPC_OPERATIONS, ...HTTP_OPERATIONS]) {
        expect(codeValues).toContain(operation);
      }
      expect(codeValues).toContain("WS /ws");
    }
  });

  test("APIページが追加対象と検索の照合規則を正確に説明する", async () => {
    const englishHtml = await readDoc("en", "api");
    const japaneseHtml = await readDoc("ja", "api");

    expect(englishHtml).toContain(
      "The endpoint does not require an HTML file extension.",
    );
    expect(englishHtml).toContain("case-insensitive fixed string");
    expect(japaneseHtml).toContain("HTMLの拡張子は必須ではありません");
    expect(japaneseHtml).toContain("大文字・小文字を区別しない固定文字列");
  });

  test("GUI/API対照表がブラウザーUIの通信を網羅する", async () => {
    for (const locale of LOCALES) {
      const html = await readDoc(locale, "gui-api-mapping");
      const codeValues = readCodeValues(html);
      for (const operation of GUI_OPERATIONS) {
        expect(codeValues).toContain(operation);
      }
    }
  });
});

async function readDoc(
  locale: (typeof LOCALES)[number],
  slug: (typeof SLUGS)[number],
): Promise<string> {
  return readFile(path.join(DOCS_ROOT, locale, `${slug}.html`), "utf8");
}

function readCodeValues(html: string): string[] {
  return Array.from(
    html.matchAll(/<code(?:\s[^>]*)?>([^<]+)<\/code>/g),
    (match) => match[1] ?? "",
  );
}
