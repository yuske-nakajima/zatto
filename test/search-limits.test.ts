import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SEARCH_LIMITS } from "../src/server/search.js";
import { SessionStore } from "../src/server/session.js";

describe("HTML search resource limits", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-limit-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("検索語長の境界を検証する", async () => {
    const app = await createSearchApp(["<p>ok</p>"]);
    const accepted = await app.inject({
      method: "GET",
      url: `/api/search?q=${"a".repeat(SEARCH_LIMITS.queryLength)}`,
    });
    const rejected = await app.inject({
      method: "GET",
      url: `/api/search?q=${"a".repeat(SEARCH_LIMITS.queryLength + 1)}`,
    });

    expect(accepted.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().code).toBe("SEARCH_QUERY_TOO_LONG");
    await app.close();
  });

  test("上限を超えるHTMLを読まず明確なエラーを返す", async () => {
    const app = await createSearchApp([
      "x".repeat(SEARCH_LIMITS.fileBytes + 1),
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=x",
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      code: "SEARCH_FILE_TOO_LARGE",
      maxBytes: SEARCH_LIMITS.fileBytes,
    });
    await app.close();
  });

  test("ファイル別一致上限で打ち切りを明示する", async () => {
    const app = await createSearchApp([
      `${"x\n".repeat(SEARCH_LIMITS.fileMatches)}x`,
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=x",
    });
    const result = response.json();

    expect(result.totalMatches).toBe(SEARCH_LIMITS.fileMatches);
    expect(result.truncated).toBe(true);
    expect(result.files[0]).toMatchObject({
      matchCount: SEARCH_LIMITS.fileMatches,
      truncated: true,
    });
    await app.close();
  });

  test("全ファイル合計の一致上限で打ち切りを明示する", async () => {
    const file = "x".repeat(SEARCH_LIMITS.fileMatches + 1);
    const app = await createSearchApp(Array.from({ length: 6 }, () => file));
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=x",
    });
    const result = response.json();

    expect(result.totalMatches).toBe(SEARCH_LIMITS.totalMatches);
    expect(result.files).toHaveLength(5);
    expect(result.truncated).toBe(true);
    await app.close();
  });

  test("検索リクエスト全体の入力bytesを境界で許可し超過前に停止する", async () => {
    const totalFileBytes = 50 * 1024 * 1024;
    expect(SEARCH_LIMITS.totalFileBytes).toBe(totalFileBytes);
    const fullPath = path.join(tempDir, "full-0.html");
    await writeFile(fullPath, Buffer.alloc(SEARCH_LIMITS.fileBytes, 97));
    const fullPaths = [fullPath];
    for (let index = 1; index < 5; index += 1) {
      const linkedPath = path.join(tempDir, `full-${index}.html`);
      await link(fullPath, linkedPath);
      fullPaths.push(linkedPath);
    }
    const store = new SessionStore(path.join(tempDir, "total-session.json"));
    await store.load();
    const fullEntries = await store.addEntries(fullPaths);
    const app = await createApp({ sessionStore: store });

    const boundary = await app.inject({
      method: "GET",
      url: "/api/search?q=z",
    });
    expect(boundary.statusCode).toBe(200);
    expect(boundary.json().truncated).toBe(false);

    await store.removeEntry(fullEntries.at(-1)?.id ?? "");
    const almostPath = path.join(tempDir, "almost.html");
    const overflowPath = path.join(tempDir, "overflow.html");
    await writeFile(almostPath, Buffer.alloc(9 * 1024 * 1024, 97));
    await writeFile(overflowPath, Buffer.alloc(2 * 1024 * 1024, 97));
    await store.addEntries([almostPath, overflowPath]);

    const limited = await app.inject({ method: "GET", url: "/api/search?q=z" });
    expect(limited.statusCode).toBe(200);
    expect(limited.json()).toMatchObject({ truncated: true, files: [] });
    await app.close();
  });

  test("巨大な単一行を上限長のsnippetへ切り詰める", async () => {
    const source = `${"a".repeat(4_000)}needle${"b".repeat(4_000)}`;
    const app = await createSearchApp([source]);
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=needle",
    });
    const line = response.json().files[0].lines[0];

    expect(line.lineText.length).toBeLessThanOrEqual(
      SEARCH_LIMITS.snippetLength,
    );
    expect(line.truncated).toBe(true);
    expect(
      line.lineText.slice(line.ranges[0].start, line.ranges[0].start + 6),
    ).toBe("needle");
    await app.close();
  });

  test("response文字数上限で検索を打ち切る", async () => {
    const line = `${"a".repeat(SEARCH_LIMITS.snippetLength - 2)}x`;
    const source = `${line}\n`.repeat(
      Math.ceil(SEARCH_LIMITS.responseChars / line.length) + 10,
    );
    const app = await createSearchApp([source]);
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=x",
    });
    const result = response.json();

    expect(result.truncated).toBe(true);
    expect(response.body.length).toBeLessThanOrEqual(
      SEARCH_LIMITS.responseChars,
    );
    await app.close();
  });

  async function createSearchApp(contents: string[]) {
    const store = new SessionStore(path.join(tempDir, "session.json"));
    await store.load();
    const paths: string[] = [];
    for (const [index, content] of contents.entries()) {
      const htmlPath = path.join(tempDir, `${index}.html`);
      await writeFile(htmlPath, content, "utf8");
      paths.push(htmlPath);
    }
    await store.addEntries(paths);
    return createApp({ sessionStore: store });
  }
});
