import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";

describe("session merge API", () => {
  let tempDir: string;
  let sessionFilePath: string;
  let existingPath: string;
  let addedPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-session-merge-"));
    sessionFilePath = path.join(tempDir, "session.json");
    existingPath = path.join(tempDir, "existing.html");
    addedPath = path.join(tempDir, "added.html");
    await writeFile(existingPath, "<title>Existing</title>", "utf8");
    await writeFile(addedPath, "<title>Added</title>", "utf8");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("既存metadataと順序を維持して未登録pathを末尾へ追加する", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [existing] = await store.addEntries([existingPath]);
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session?mode=merge",
      payload: exchange([existingPath, addedPath]),
    });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries;
    expect(entries[0]).toEqual(existing);
    expect(entries[1]).toMatchObject({ absPath: addedPath, title: "Added" });
    expect(JSON.parse(await readFile(sessionFilePath, "utf8"))).toEqual({
      entries,
    });
    await app.close();
  });

  test("字句別名を含む全入力を検証してsessionを変更しない", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [existing] = await store.addEntries([existingPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    const alias = `${tempDir}${path.sep}sub${path.sep}..${path.sep}added.html`;
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session?mode=merge",
      payload: exchange([addedPath, alias]),
    });

    expect(response.statusCode).toBe(400);
    expect(store.getSession()).toEqual({ entries: [existing] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    await app.close();
  });

  test("後続pathの検証失敗時も先行pathを追加しない", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [existing] = await store.addEntries([existingPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session?mode=merge",
      payload: exchange([addedPath, path.join(tempDir, "missing.html")]),
    });

    expect(response.statusCode).toBe(400);
    expect(store.getSession()).toEqual({ entries: [existing] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    await app.close();
  });

  test("未知のmodeを400として拒否する", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session?mode=append",
      payload: exchange([]),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "import mode が不正です" });
    await app.close();
  });
});

function exchange(paths: string[]) {
  return {
    format: "zatto-session",
    version: 1,
    entries: paths.map((entryPath) => ({ path: entryPath })),
  };
}
