import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

describe("DELETE /api/session/entries", () => {
  let tempDir: string;
  let sessionFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-bulk-api-"));
    sessionFilePath = path.join(tempDir, "session.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { force: true, recursive: true });
  });

  test("指定したIDだけを削除し、順序・disk上のHTML・通知回数を保つ", async () => {
    const folderPath = path.join(tempDir, "folder");
    const htmlPaths = [
      path.join(folderPath, "direct.html"),
      path.join(tempDir, "outside.html"),
      path.join(folderPath, "nested", "descendant.html"),
      path.join(tempDir, "last.html"),
    ];
    await Promise.all(
      htmlPaths.map(async (htmlPath, index) => {
        await writeFileAtomically(htmlPath, `<title>Entry ${index}</title>`);
      }),
    );
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const entries = await store.addEntries(htmlPaths);
    const realtimeHub = new RealtimeHub();
    const broadcast = vi.spyOn(realtimeHub, "broadcast");
    const onSessionChanged = vi.fn();
    const app = await createApp({
      sessionStore: store,
      realtimeHub,
      onSessionChanged,
    });
    await app.ready();
    const socket = await app.injectWS("/ws");
    const updatePromise = new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(data.toString()));
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/session/entries",
      payload: { ids: [entries[0].id, entries[2].id] },
    });
    const message = JSON.parse(await updatePromise);

    expect(response.statusCode).toBe(204);
    expect(store.getSession()).toEqual({ entries: [entries[1], entries[3]] });
    expect(onSessionChanged).toHaveBeenCalledOnce();
    expect(onSessionChanged).toHaveBeenCalledWith({
      entries: [entries[1], entries[3]],
    });
    expect(broadcast).toHaveBeenCalledOnce();
    expect(message).toEqual({
      type: "session:update",
      entries: [entries[1], entries[3]],
    });
    await Promise.all(htmlPaths.map((htmlPath) => access(htmlPath)));
    socket.close();
    await app.close();
  });

  test.each([
    ["body無し", undefined],
    ["配列body", []],
    ["ids無し", {}],
    ["空配列", { ids: [] }],
    ["空文字", { ids: [""] }],
    ["文字列以外", { ids: [1] }],
    ["重複", { ids: ["entry-id", "entry-id"] }],
  ])("%sを400で拒否する", async (_name, payload) => {
    const htmlPath = path.join(tempDir, "entry.html");
    await writeFile(htmlPath, "<title>Entry</title>", "utf8");
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [entry] = await store.addEntries([htmlPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    const app = await createApp({ sessionStore: store });
    const normalizedPayload =
      payload && "ids" in payload
        ? {
            ids: payload.ids.map((id) => (id === "entry-id" ? entry.id : id)),
          }
        : payload;

    const response = await app.inject({
      method: "DELETE",
      url: "/api/session/entries",
      payload: normalizedPayload,
    });

    expect(response.statusCode).toBe(400);
    expect(store.getSession()).toEqual({ entries: [entry] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    await app.close();
  });

  test("不明なIDを含む集合を404で拒否し、全エントリを維持する", async () => {
    const htmlPath = path.join(tempDir, "entry.html");
    await writeFile(htmlPath, "<title>Entry</title>", "utf8");
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [entry] = await store.addEntries([htmlPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/session/entries",
      payload: { ids: [entry.id, "missing"] },
    });

    expect(response.statusCode).toBe(404);
    expect(store.getSession()).toEqual({ entries: [entry] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    await app.close();
  });

  test("永続化失敗を500で返し、sessionと通知を変更しない", async () => {
    const htmlPath = path.join(tempDir, "entry.html");
    await writeFile(htmlPath, "<title>Entry</title>", "utf8");
    let rejectWrites = false;
    const store = new SessionStore(sessionFilePath, async (target, content) => {
      if (rejectWrites) throw new Error("bulk persistence failed");
      await writeFileAtomically(target, content);
    });
    await store.load();
    const [entry] = await store.addEntries([htmlPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    rejectWrites = true;
    const realtimeHub = new RealtimeHub();
    const broadcast = vi.spyOn(realtimeHub, "broadcast");
    const onSessionChanged = vi.fn();
    const app = await createApp({
      sessionStore: store,
      realtimeHub,
      onSessionChanged,
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/session/entries",
      payload: { ids: [entry.id] },
    });

    expect(response.statusCode).toBe(500);
    expect(store.getSession()).toEqual({ entries: [entry] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    expect(onSessionChanged).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    await app.close();
  });
});
