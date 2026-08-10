import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";
import {
  createImportedEntries,
  SessionImportValidationError,
} from "../src/server/session-import.js";

describe("session import path validation", () => {
  let tempDir: string;
  let sessionFilePath: string;
  let htmlPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-import-path-"));
    sessionFilePath = path.join(tempDir, "session.json");
    htmlPath = path.join(tempDir, "page.html");
    await writeFile(htmlPath, "<title>Page</title>", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("path.resolve後に重複する字句別名を拒否する", async () => {
    const aliasPath = `${tempDir}${path.sep}sub${path.sep}..${path.sep}page.html`;

    await expect(
      createImportedEntries([htmlPath, aliasPath], async () => "Page"),
    ).rejects.toThrow("entries に重複した path を指定できません");
  });

  test("正規化した絶対パスでエントリを再生成する", async () => {
    const aliasPath = `${tempDir}${path.sep}sub${path.sep}..${path.sep}page.html`;

    const [entry] = await createImportedEntries(
      [aliasPath],
      async () => "Page",
    );

    expect(entry.absPath).toBe(htmlPath);
  });

  test.each([
    ["NUL", () => `${htmlPath}\0.html`],
    ["ENOTDIR", () => path.join(htmlPath, "child.html")],
  ])("%sを復元不能パスとして正規化する", async (_label, createPath) => {
    await expect(
      createImportedEntries([createPath()], async () => "Page"),
    ).rejects.toBeInstanceOf(SessionImportValidationError);
  });

  test("title読込み失敗を復元不能エラーとして正規化する", async () => {
    const readError = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });

    await expect(
      createImportedEntries([htmlPath], async () => {
        throw readError;
      }),
    ).rejects.toBeInstanceOf(SessionImportValidationError);
  });

  test("復元不能パスのAPI importは400で既存セッションを維持する", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [previous] = await store.addEntries([htmlPath]);
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session",
      payload: {
        format: "zatto-session",
        version: 1,
        entries: [{ path: path.join(htmlPath, "child.html") }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(store.getSession()).toEqual({ entries: [previous] });
    await app.close();
  });
});
