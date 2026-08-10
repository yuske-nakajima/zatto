import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";

describe("session exchange API", () => {
  let tempDir: string;
  let sessionFilePath: string;
  let firstPath: string;
  let secondPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-exchange-test-"));
    sessionFilePath = path.join(tempDir, "config", "session.json");
    firstPath = path.join(tempDir, "first.html");
    secondPath = path.join(tempDir, "second.htm");
    await writeFile(firstPath, "<title>First</title>", "utf8");
    await writeFile(secondPath, "<title>Second</title>", "utf8");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { force: true, recursive: true });
  });

  test("エクスポートは表示順の絶対パスだけを返す", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [first, second] = await store.addEntries([firstPath, secondPath]);
    await store.reorderEntries([second.id, first.id]);
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "GET",
      url: "/api/session/export",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      format: "zatto-session",
      version: 1,
      entries: [{ path: secondPath }, { path: firstPath }],
    });
    await app.close();
  });

  test("インポートは全置換し、再生成したエントリを一度だけ通知する", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [previous] = await store.addEntries([firstPath]);
    const onSessionChanged = vi.fn();
    const realtimeHub = new RealtimeHub();
    const broadcast = vi.spyOn(realtimeHub, "broadcast");
    const app = await createApp({
      sessionStore: store,
      onSessionChanged,
      realtimeHub,
      serverIdentity: { instanceId: "managed", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session",
      headers: { "x-zatto-instance-id": "managed" },
      payload: {
        format: "zatto-session",
        version: 1,
        entries: [{ path: secondPath }, { path: firstPath }],
      },
    });

    expect(response.statusCode).toBe(200);
    const entries = response.json().entries as Array<{
      id: string;
      absPath: string;
      title: string;
      addedAt: number;
    }>;
    expect(entries.map(({ absPath }) => absPath)).toEqual([
      secondPath,
      firstPath,
    ]);
    expect(entries[0]).toMatchObject({ title: "Second" });
    expect(entries.map(({ id }) => id)).not.toContain(previous.id);
    expect(onSessionChanged).toHaveBeenCalledOnce();
    expect(onSessionChanged).toHaveBeenCalledWith({ entries });
    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith({
      type: "session:update",
      entries,
    });
    expect(JSON.parse(await readFile(sessionFilePath, "utf8"))).toEqual({
      entries,
    });
    await app.close();
  });

  test("server identityが一致しないインポートを拒否する", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({
      sessionStore: store,
      serverIdentity: { instanceId: "managed", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session",
      headers: { "x-zatto-instance-id": "other" },
      payload: { format: "zatto-session", version: 1, entries: [] },
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });

  test("不正なJSONでは既存セッションを変更しない", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [previous] = await store.addEntries([firstPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    const onSessionChanged = vi.fn();
    const app = await createApp({ sessionStore: store, onSessionChanged });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session",
      headers: { "content-type": "application/json" },
      payload: "{broken",
    });

    expect(response.statusCode).toBe(400);
    expect(store.getSession()).toEqual({ entries: [previous] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    expect(onSessionChanged).not.toHaveBeenCalled();
    await app.close();
  });

  test.each([
    ["不正形式", () => ({ format: "other", version: 1, entries: [] })],
    [
      "未対応version",
      () => ({ format: "zatto-session", version: 2, entries: [] }),
    ],
    [
      "重複パス",
      () => ({
        format: "zatto-session",
        version: 1,
        entries: [{ path: firstPath }, { path: firstPath }],
      }),
    ],
    [
      "非絶対パス",
      () => ({
        format: "zatto-session",
        version: 1,
        entries: [{ path: "relative.html" }],
      }),
    ],
    [
      "HTML以外",
      () => ({
        format: "zatto-session",
        version: 1,
        entries: [{ path: path.join(tempDir, "notes.txt") }],
      }),
    ],
    [
      "存在しないファイル",
      () => ({
        format: "zatto-session",
        version: 1,
        entries: [{ path: path.join(tempDir, "missing.html") }],
      }),
    ],
  ])("%sでは既存セッションを変更しない", async (_label, createPayload) => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [previous] = await store.addEntries([firstPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    const onSessionChanged = vi.fn();
    const app = await createApp({ sessionStore: store, onSessionChanged });

    const response = await app.inject({
      method: "PUT",
      url: "/api/session",
      payload: createPayload(),
    });

    expect(response.statusCode).toBe(400);
    expect(store.getSession()).toEqual({ entries: [previous] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    expect(onSessionChanged).not.toHaveBeenCalled();
    await app.close();
  });
});
