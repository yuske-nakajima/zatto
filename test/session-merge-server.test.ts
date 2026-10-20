import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";
import { workspaceFilePath } from "../src/server/workspace-store.js";
import { rpc } from "./rpc-server-helper.js";

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

    const response = await rpc(app, "session.import", {
      workspaceId: "default",
      mode: "merge",
      exchange: exchange([existingPath, addedPath]),
    });

    expect(response.code).toBe(0);
    const entries = response.json().entries;
    expect(entries[0]).toEqual(existing);
    expect(entries[1]).toMatchObject({ absPath: addedPath, title: "Added" });
    expect(
      JSON.parse(await readFile(workspaceFilePath(sessionFilePath), "utf8")),
    ).toEqual({
      version: 2,
      activeWorkspaceId: "default",
      workspaces: [{ id: "default", name: "Default", entries }],
    });
    await app.close();
  });

  test("字句別名を含む全入力を検証してsessionを変更しない", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [existing] = await store.addEntries([existingPath]);
    const persistedBefore = await readFile(
      workspaceFilePath(sessionFilePath),
      "utf8",
    );
    const alias = `${tempDir}${path.sep}sub${path.sep}..${path.sep}added.html`;
    const app = await createApp({ sessionStore: store });

    const response = await rpc(app, "session.import", {
      workspaceId: "default",
      mode: "merge",
      exchange: exchange([addedPath, alias]),
    });

    expect(response.code).toBe(-32602);
    expect(store.getSession()).toEqual({ entries: [existing] });
    expect(await readFile(workspaceFilePath(sessionFilePath), "utf8")).toBe(
      persistedBefore,
    );
    await app.close();
  });

  test("後続pathの検証失敗時も先行pathを追加しない", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [existing] = await store.addEntries([existingPath]);
    const persistedBefore = await readFile(
      workspaceFilePath(sessionFilePath),
      "utf8",
    );
    const app = await createApp({ sessionStore: store });

    const response = await rpc(app, "session.import", {
      workspaceId: "default",
      mode: "merge",
      exchange: exchange([addedPath, path.join(tempDir, "missing.html")]),
    });

    expect(response.code).toBe(-32602);
    expect(store.getSession()).toEqual({ entries: [existing] });
    expect(await readFile(workspaceFilePath(sessionFilePath), "utf8")).toBe(
      persistedBefore,
    );
    await app.close();
  });

  test("未知のmodeを不正なparamsとして拒否する", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({ sessionStore: store });

    const response = await rpc(app, "session.import", {
      workspaceId: "default",
      mode: "append",
      exchange: exchange([]),
    });

    expect(response.code).toBe(-32602);
    expect(response.json()).toEqual({
      message: "Invalid params",
      issues: [
        {
          path: ["mode"],
          message: 'Invalid option: expected one of "replace"|"merge"',
        },
      ],
    });
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
