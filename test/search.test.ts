import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";
import { rpc } from "./rpc-server-helper.js";

describe("HTML search API", () => {
  let tempDir: string;
  let sessionFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-search-test-"));
    sessionFilePath = path.join(tempDir, "config", "session.json");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("登録済みHTMLを大文字小文字を区別せず行単位で検索する", async () => {
    const firstPath = path.join(tempDir, "first.html");
    const secondPath = path.join(tempDir, "second.html");
    await writeFile(
      firstPath,
      ["<title>First</title>", "<p>Alpha alpha</p>", "<p>İX</p>"].join("\n"),
      "utf8",
    );
    await writeFile(
      secondPath,
      ["<title>Second</title>", "<div>ALPHA</div>"].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(tempDir, "unregistered.html"),
      "<p>alpha</p>",
      "utf8",
    );
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [first, second] = await store.addEntries([firstPath, secondPath]);
    const app = await createApp({ sessionStore: store });

    const response = await rpc(app, "search.query", { query: "alpha" });

    expect(response.code).toBe(0);
    expect(response.json()).toEqual({
      query: "alpha",
      totalMatches: 3,
      truncated: false,
      files: [
        {
          entryId: first.id,
          title: "First",
          fileName: "first.html",
          absPath: firstPath,
          matchCount: 2,
          truncated: false,
          lines: [
            {
              lineNumber: 2,
              startOffset: 0,
              lineText: "<p>Alpha alpha</p>",
              truncated: false,
              ranges: [
                { start: 3, length: 5 },
                { start: 9, length: 5 },
              ],
            },
          ],
        },
        {
          entryId: second.id,
          title: "Second",
          fileName: "second.html",
          absPath: secondPath,
          matchCount: 1,
          truncated: false,
          lines: [
            {
              lineNumber: 2,
              startOffset: 0,
              lineText: "<div>ALPHA</div>",
              truncated: false,
              ranges: [{ start: 5, length: 5 }],
            },
          ],
        },
      ],
    });
    const unicodeResponse = await rpc(app, "search.query", { query: "x" });
    expect(unicodeResponse.json().files[0].lines).toEqual([
      {
        lineNumber: 3,
        startOffset: 0,
        lineText: "<p>İX</p>",
        truncated: false,
        ranges: [{ start: 4, length: 1 }],
      },
    ]);
    await app.close();
  });

  test("空の検索語ではファイルを読まず空結果を返す", async () => {
    const htmlPath = path.join(tempDir, "removed.html");
    await writeFile(htmlPath, "<title>Removed</title>", "utf8");
    const store = new SessionStore(sessionFilePath);
    await store.load();
    await store.addEntries([htmlPath]);
    await unlink(htmlPath);
    const app = await createApp({ sessionStore: store });

    const response = await rpc(app, "search.query", { query: "" });

    expect(response.code).toBe(0);
    expect(response.json()).toEqual({
      query: "",
      totalMatches: 0,
      truncated: false,
      files: [],
    });
    await app.close();
  });

  test("登録済みHTMLを読めない場合は検索エラーを返す", async () => {
    const htmlPath = path.join(tempDir, "removed.html");
    await writeFile(htmlPath, "<title>Removed</title>", "utf8");
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [removedEntry] = await store.addEntries([htmlPath]);
    await unlink(htmlPath);
    const app = await createApp({ sessionStore: store });

    const response = await rpc(app, "search.query", { query: "removed" });

    expect(response.code).toBe(-32603);
    expect(response.json()).toEqual({
      code: "SEARCH_FILE_UNREADABLE",
      message: "An HTML file could not be read.",
      entryId: removedEntry.id,
    });
    await app.close();
  });

  test("検索語が文字列でない場合はリクエストを拒否する", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({ sessionStore: store });

    const response = await rpc(app, "search.query", { query: ["one", "two"] });

    expect(response.code).toBe(-32602);
    expect(response.json()).toEqual({
      message: "Invalid params",
      issues: [
        {
          path: ["query"],
          message: "Invalid input: expected string, received array",
        },
      ],
    });
    await app.close();
  });
});
