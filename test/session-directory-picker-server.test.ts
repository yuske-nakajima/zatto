import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";

describe("POST /api/session/pick-directory", () => {
  let tempDir: string;
  let sessionFilePath: string;
  let selectedDirectory: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-directory-api-"));
    sessionFilePath = path.join(tempDir, "session.json");
    selectedDirectory = path.join(tempDir, "selected");
    await mkdir(path.join(selectedDirectory, "nested"), { recursive: true });
    await Promise.all([
      writeFile(path.join(selectedDirectory, "bravo.HTML"), "<title>B</title>"),
      writeFile(path.join(selectedDirectory, "alpha.htm"), "<title>A</title>"),
      writeFile(
        path.join(selectedDirectory, "nested", "charlie.html"),
        "<title>C</title>",
      ),
      writeFile(path.join(selectedDirectory, "ignored.txt"), "ignored"),
    ]);
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("セッション取得でディレクトリ選択の利用可否と識別子を返す", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({
      sessionStore: store,
      pickDirectory: vi.fn(),
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const available = await app.inject({ method: "GET", url: "/api/session" });
    expect(available.json()).toMatchObject({
      directoryPicker: { available: true, instanceId: "managed-instance" },
    });
    await app.close();

    const unavailableApp = await createApp({ sessionStore: store });
    const unavailable = await unavailableApp.inject({
      method: "GET",
      url: "/api/session",
    });
    expect(unavailable.json()).toMatchObject({
      directoryPicker: { available: false },
    });
    await unavailableApp.close();
  });

  test.each(["direct", "recursive"] as const)(
    "%sモードで列挙したHTMLを1回の追加処理で登録する",
    async (mode) => {
      const store = new SessionStore(sessionFilePath);
      await store.load();
      const addEntries = vi.spyOn(store, "addEntries");
      const realtimeHub = new RealtimeHub();
      const broadcast = vi.spyOn(realtimeHub, "broadcast");
      const onSessionChanged = vi.fn();
      const pickDirectory = vi.fn().mockResolvedValue({
        kind: "selected",
        path: selectedDirectory,
      });
      const app = await createApp({
        sessionStore: store,
        pickDirectory,
        realtimeHub,
        onSessionChanged,
        serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/session/pick-directory",
        headers: { "x-zatto-instance-id": "managed-instance" },
        payload: { mode },
      });
      const expectedPaths = [
        path.join(selectedDirectory, "alpha.htm"),
        path.join(selectedDirectory, "bravo.HTML"),
        ...(mode === "recursive"
          ? [path.join(selectedDirectory, "nested", "charlie.html")]
          : []),
      ];

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        cancelled: false,
        added: expectedPaths.map((absPath) => ({ absPath })),
        session: { entries: expectedPaths.map((absPath) => ({ absPath })) },
      });
      expect(addEntries).toHaveBeenCalledOnce();
      expect(addEntries).toHaveBeenCalledWith(expectedPaths);
      expect(onSessionChanged).toHaveBeenCalledOnce();
      expect(broadcast).toHaveBeenCalledOnce();
      await app.close();
    },
  );

  test("キャンセル時は200を返し、セッションを変更しない", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const addEntries = vi.spyOn(store, "addEntries");
    const onSessionChanged = vi.fn();
    const app = await createApp({
      sessionStore: store,
      pickDirectory: vi.fn().mockResolvedValue({ kind: "cancelled" }),
      onSessionChanged,
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/session/pick-directory",
      headers: { "x-zatto-instance-id": "managed-instance" },
      payload: { mode: "recursive" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cancelled: true, added: [] });
    expect(addEntries).not.toHaveBeenCalled();
    expect(onSessionChanged).not.toHaveBeenCalled();
    await app.close();
  });

  test.each([
    ["識別子不一致", "other-instance", { mode: "direct" }, 409],
    ["mode無し", "managed-instance", {}, 400],
    ["不明なmode", "managed-instance", { mode: "nested" }, 400],
  ])("%sを拒否する", async (_name, instanceId, payload, statusCode) => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const pickDirectory = vi.fn();
    const app = await createApp({
      sessionStore: store,
      pickDirectory,
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/session/pick-directory",
      headers: { "x-zatto-instance-id": instanceId },
      payload,
    });

    expect(response.statusCode).toBe(statusCode);
    expect(pickDirectory).not.toHaveBeenCalled();
    await app.close();
  });

  test("利用できない環境では501を返す", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({
      sessionStore: store,
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/session/pick-directory",
      headers: { "x-zatto-instance-id": "managed-instance" },
      payload: { mode: "direct" },
    });

    expect(response.statusCode).toBe(501);
    await app.close();
  });
});
