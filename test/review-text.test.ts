import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { countPassage, visibleText } from "../src/server/review-text.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-review-text-"));
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

test("HTML は表示される文字だけを、空白を除いて読む", async () => {
  const file = path.join(dir, "a.html");
  await writeFile(
    file,
    "<title>題</title><style>p{}</style><script>let x = 1;</script><!-- 注 --><p>A &amp; B&#x3042;</p>\n<p>次の  段落</p>",
  );

  expect(await visibleText(file)).toBe("A&Bあ次の段落");
});

test("Markdown は描画後の文字で照合し、装飾をまたぐ一節も見つける", async () => {
  const file = path.join(dir, "a.md");
  await writeFile(file, "# 見出し\n\n赤枠は**確認してほしい範囲**です。\n");
  const text = await visibleText(file);

  expect(countPassage(text, "赤枠は確認してほしい範囲です")).toBe(1);
  expect(countPassage(text, "見出し")).toBe(1);
  expect(countPassage(text, "**")).toBe(0);
});
