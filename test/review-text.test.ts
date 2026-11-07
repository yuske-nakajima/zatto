import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { visibleText } from "../src/server/review-text.js";

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

test("noscript と template の中身は表示されないので読まない", async () => {
  const file = path.join(dir, "a.html");
  await writeFile(
    file,
    "<body><noscript>隠れた文章</noscript><template>型の文章</template><p>本文</p></body>",
  );

  expect(await visibleText(file)).toBe("本文");
});

test("Markdown は描画後の文字で照合し、装飾をまたぐ一節も見つける", async () => {
  const file = path.join(dir, "a.md");
  await writeFile(file, "# 見出し\n\n赤枠は**確認してほしい範囲**です。\n");
  const text = await visibleText(file);

  expect(text).toContain("赤枠は確認してほしい範囲です");
  expect(text).toContain("見出し");
  expect(text).not.toContain("**");
});
