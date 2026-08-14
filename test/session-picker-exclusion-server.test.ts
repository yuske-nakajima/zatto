import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

describe("native picker exclusion and failures", () => {
  let tempDir: string;
  let sessionFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-picker-state-"));
    sessionFilePath = path.join(tempDir, "session.json");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test.each([
    ["directory", "/api/session/pick-directory", "/api/session/pick"],
    ["file", "/api/session/pick", "/api/session/pick-directory"],
  ])(
    "%s pickerの表示中はもう一方のpickerを拒否する",
    async (activePicker, activeUrl, rejectedUrl) => {
      const store = new SessionStore(sessionFilePath);
      await store.load();
      let finishPicking: (() => void) | undefined;
      const pendingPick = new Promise<{ kind: "cancelled" }>((resolve) => {
        finishPicking = () => resolve({ kind: "cancelled" });
      });
      const pickFiles = vi.fn(() =>
        activePicker === "file"
          ? pendingPick
          : Promise.resolve({ kind: "cancelled" as const }),
      );
      const pickDirectory = vi.fn(() =>
        activePicker === "directory"
          ? pendingPick
          : Promise.resolve({ kind: "cancelled" as const }),
      );
      const app = await createApp({
        sessionStore: store,
        pickFiles,
        pickDirectory,
        serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
      });
      const requestFor = (url: string) => ({
        method: "POST" as const,
        url,
        headers: { "x-zatto-instance-id": "managed-instance" },
        payload: url.endsWith("pick-directory")
          ? { mode: "direct" }
          : undefined,
      });

      const activeResponsePromise = app.inject(requestFor(activeUrl));
      await vi.waitFor(() => {
        expect(
          activePicker === "directory" ? pickDirectory : pickFiles,
        ).toHaveBeenCalledOnce();
      });
      const rejectedResponse = await app.inject(requestFor(rejectedUrl));

      expect(rejectedResponse.statusCode).toBe(409);
      expect(
        activePicker === "directory" ? pickFiles : pickDirectory,
      ).not.toHaveBeenCalled();
      finishPicking?.();
      expect((await activeResponsePromise).statusCode).toBe(200);
      await app.close();
    },
  );

  test("列挙失敗時はセッションと通知を変更しない", async () => {
    const existingPath = path.join(tempDir, "existing.html");
    await writeFile(existingPath, "<title>Existing</title>");
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [existingEntry] = await store.addEntries([existingPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    const realtimeHub = new RealtimeHub();
    const broadcast = vi.spyOn(realtimeHub, "broadcast");
    const onSessionChanged = vi.fn();
    const addEntries = vi.spyOn(store, "addEntries");
    const app = await createApp({
      sessionStore: store,
      pickDirectory: vi.fn().mockResolvedValue({
        kind: "selected",
        path: path.join(tempDir, "missing"),
      }),
      realtimeHub,
      onSessionChanged,
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/session/pick-directory",
      headers: { "x-zatto-instance-id": "managed-instance" },
      payload: { mode: "recursive" },
    });

    expect(response.statusCode).toBe(404);
    expect(store.getSession()).toEqual({ entries: [existingEntry] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    expect(addEntries).not.toHaveBeenCalled();
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    await app.close();
  });

  test("永続化失敗時はメモリとファイルと通知を変更しない", async () => {
    const existingPath = path.join(tempDir, "existing.html");
    const selectedDirectory = path.join(tempDir, "selected");
    const addedPath = path.join(selectedDirectory, "added.html");
    await writeFile(existingPath, "<title>Existing</title>");
    await writeFileAtomically(addedPath, "<title>Added</title>");
    let rejectWrites = false;
    const store = new SessionStore(sessionFilePath, async (target, content) => {
      if (rejectWrites) throw new Error("directory import persistence failed");
      await writeFileAtomically(target, content);
    });
    await store.load();
    const [existingEntry] = await store.addEntries([existingPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    rejectWrites = true;
    const realtimeHub = new RealtimeHub();
    const broadcast = vi.spyOn(realtimeHub, "broadcast");
    const onSessionChanged = vi.fn();
    const app = await createApp({
      sessionStore: store,
      pickDirectory: vi.fn().mockResolvedValue({
        kind: "selected",
        path: selectedDirectory,
      }),
      realtimeHub,
      onSessionChanged,
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/session/pick-directory",
      headers: { "x-zatto-instance-id": "managed-instance" },
      payload: { mode: "recursive" },
    });

    expect(response.statusCode).toBe(500);
    expect(store.getSession()).toEqual({ entries: [existingEntry] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    await app.close();
  });

  test("登録済みHTMLだけなら通知せず完全なセッションを返す", async () => {
    const selectedDirectory = path.join(tempDir, "selected");
    const htmlPath = path.join(selectedDirectory, "existing.html");
    await writeFileAtomically(htmlPath, "<title>Existing</title>");
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [existingEntry] = await store.addEntries([htmlPath]);
    const onSessionChanged = vi.fn();
    const app = await createApp({
      sessionStore: store,
      pickDirectory: vi.fn().mockResolvedValue({
        kind: "selected",
        path: selectedDirectory,
      }),
      onSessionChanged,
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/session/pick-directory",
      headers: { "x-zatto-instance-id": "managed-instance" },
      payload: { mode: "direct" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      cancelled: false,
      added: [],
      session: { entries: [existingEntry] },
    });
    expect(onSessionChanged).not.toHaveBeenCalled();
    await app.close();
  });
});
