import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";

describe("session mutation notifications", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) await rm(tempDir, { force: true, recursive: true });
  });

  test("observer失敗後もimport成功を返してWebSocket通知を継続する", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-notify-failure-"));
    const htmlPath = path.join(tempDir, "page.html");
    await writeFile(htmlPath, "<title>Page</title>", "utf8");
    const store = new SessionStore(path.join(tempDir, "session.json"));
    await store.load();
    const realtimeHub = new RealtimeHub();
    const broadcast = vi.spyOn(realtimeHub, "broadcast");
    const observerError = new Error("observer failed");
    const app = await createApp({
      sessionStore: store,
      realtimeHub,
      onSessionChanged: vi.fn().mockRejectedValue(observerError),
    });
    const logError = vi.spyOn(app.log, "error");

    const response = await app.inject({
      method: "PUT",
      url: "/api/session",
      payload: {
        format: "zatto-session",
        version: 1,
        entries: [{ path: htmlPath }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(store.getSession().entries).toHaveLength(1);
    expect(logError).toHaveBeenCalledWith(
      observerError,
      "セッション更新observerの実行に失敗しました",
    );
    expect(broadcast).toHaveBeenCalledOnce();
    await app.close();
  });
});
