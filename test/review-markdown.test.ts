import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { replyWithImages } from "../src/cli/reply-images.js";
import type { ReviewAttachment } from "../src/shared/review.js";
import {
  inlineAttachmentIndexes,
  renderReplyMarkdown,
} from "../src/web/review-markdown.js";

describe("返信の Markdown", () => {
  test("表・見出し・引用・区切り線・斜体・打ち消し線・タスクリストを描画する", () => {
    const html = renderReplyMarkdown(
      [
        "## 結果",
        "",
        "| 項目 | 値 |",
        "|---|---|",
        "| 件数 | 3 |",
        "",
        "> 引用",
        "",
        "---",
        "",
        "*斜体* と ~~取り消し~~",
        "",
        "- [x] 済み",
        "- [ ] 未着手",
      ].join("\n"),
    );
    expect(html).toContain("<h2>結果</h2>");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>3</td>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<del>取り消し</del>");
    expect(html).toMatch(/<input checked="" disabled="" type="checkbox">/);
  });

  test("生の HTML は文字のまま出し、リンクは http・https・mailto だけにする", () => {
    const html = renderReplyMarkdown(
      "<script>alert(1)</script>\n\n[a](https://example.com) [b](javascript:alert(1)) <b>太字</b>",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<a href="https://example.com"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;b&gt;太字&lt;/b&gt;");
  });

  test("画像は同じ返信の添付だけを描画し、URL やパスは読み込まずに alt だけを出す", () => {
    const attachments: ReviewAttachment[] = [
      {
        id: "a1",
        name: "diagram.png",
        type: "image/png",
        path: "/data/review-attachments/a1.png",
      },
    ];
    const html = renderReplyMarkdown(
      "![構成図](attachment:1) ![外部](https://example.com/x.png) ![](/Users/me/secret.png) ![なし](attachment:2)",
      attachments,
    );
    expect(html).toContain('src="/review-attachments/a1.png"');
    expect(html).toContain('alt="構成図"');
    expect(html).toContain('data-review-zoom="0"');
    expect(html).toContain("外部");
    expect(html).toContain("なし");
    expect(html).not.toContain("example.com");
    expect(html).not.toContain("/Users/me");
    expect(
      inlineAttachmentIndexes("![a](attachment:1) ![b](attachment:3)"),
    ).toEqual(new Set([0, 2]));
  });
});

describe("返信の画像の添付", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "zatto-reply-images-"));
    await writeFile(path.join(dir, "a.png"), Buffer.from([1, 2, 3]));
    await writeFile(path.join(dir, "b.jpg"), Buffer.from([4]));
    await writeFile(path.join(dir, "c.txt"), "text");
  });
  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  test("本文の手元の画像を添付に変え、元のパスを残さない", async () => {
    const reply = await replyWithImages(
      `図です ![構成図](${path.join(dir, "a.png")})\n\n\`![コード](${path.join(dir, "b.jpg")})\`\n\n![外部](https://example.com/x.png)`,
      [path.join(dir, "b.jpg")],
    );
    expect(reply.body).toBe(
      "図です ![構成図](attachment:1)\n\n`![コード](" +
        path.join(dir, "b.jpg") +
        ")`\n\n![外部](https://example.com/x.png)",
    );
    expect(reply.attachments).toEqual([
      { name: "a.png", type: "image/png", data: "AQID" },
      { name: "b.jpg", type: "image/jpeg", data: "BA==" },
    ]);
    expect(JSON.stringify(reply.attachments)).not.toContain(dir);
  });

  test("相対パスは基準のディレクトリーから読む", async () => {
    const reply = await replyWithImages("![](a.png)", [], dir);
    expect(reply.body).toBe("![](attachment:1)");
  });

  test("画像以外、存在しないファイル、枚数の超過を拒否する", async () => {
    await expect(replyWithImages("x", ["c.txt"], dir)).rejects.toThrow(
      "PNG・JPEG・WebP・GIF",
    );
    await expect(replyWithImages("![](missing.png)", [], dir)).rejects.toThrow(
      "見つかりません",
    );
    await expect(
      replyWithImages("x", Array(5).fill("a.png"), dir),
    ).rejects.toThrow("4 枚まで");
  });
});
