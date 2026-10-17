import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";
import { rpc } from "./rpc-server-helper.js";

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
    ["directory", "session.pickDirectory", "session.pickFiles"],
    ["file", "session.pickFiles", "session.pickDirectory"],
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
      const requestFor = (method: string) =>
        method === "session.pickDirectory"
          ? rpc(app, "session.pickDirectory", {
              mode: "direct",
              instanceId: "managed-instance",
            })
          : rpc(app, "session.pickFiles", { instanceId: "managed-instance" });

      const activeResponsePromise = requestFor(activeUrl);
      await vi.waitFor(() => {
        expect(
          activePicker === "directory" ? pickDirectory : pickFiles,
        ).toHaveBeenCalledOnce();
      });
      const rejectedResponse = await requestFor(rejectedUrl);

      expect(rejectedResponse.code).toBe(1005);
      expect(
        activePicker === "directory" ? pickFiles : pickDirectory,
      ).not.toHaveBeenCalled();
      finishPicking?.();
      expect((await activeResponsePromise).code).toBe(0);
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

    const response = await rpc(app, "session.pickDirectory", {
      ...{ mode: "recursive" },
      instanceId: "managed-instance",
    });

    expect(response.code).toBe(1001);
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

    const response = await rpc(app, "session.pickDirectory", {
      ...{ mode: "recursive" },
      instanceId: "managed-instance",
    });

    expect(response.code).toBe(-32603);
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

    const response = await rpc(app, "session.pickDirectory", {
      ...{ mode: "direct" },
      instanceId: "managed-instance",
    });

    expect(response.code).toBe(0);
    expect(response.json()).toEqual({
      cancelled: false,
      added: [],
      session: { entries: [existingEntry] },
    });
    expect(onSessionChanged).not.toHaveBeenCalled();
    await app.close();
  });
});
