import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { APP_VERSION } from "../src/meta.js";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";

describe("zatto server", () => {
  let tempDir: string;
  let sessionFilePath: string;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-test-"));
    sessionFilePath = path.join(tempDir, "config", "session.json");
    dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-07-29T00:00:00.000Z").getTime());
  });

  afterEach(async () => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
    dateNowSpy.mockRestore();
    await rm(tempDir, { force: true, recursive: true });
  });

  test("セッション追加時に title を抽出して永続化する", async () => {
    const htmlPath = path.join(tempDir, "sample.html");
    await writeFile(
      htmlPath,
      "<!doctype html><html><head><title>サンプル画面</title></head><body>ok</body></html>",
      "utf8",
    );

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const added = await store.addEntries([htmlPath, htmlPath]);

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      absPath: htmlPath,
      title: "サンプル画面",
      addedAt: new Date("2026-07-29T00:00:00.000Z").getTime(),
    });

    const persisted = JSON.parse(await readFile(sessionFilePath, "utf8")) as {
      entries: Array<{ absPath: string; title: string }>;
    };
    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0]).toMatchObject({
      absPath: htmlPath,
      title: "サンプル画面",
    });
  });

  test("起動時に存在しないファイルを除外して復元する", async () => {
    const existingHtmlPath = path.join(tempDir, "existing.html");
    await writeFile(existingHtmlPath, "<title>existing</title>", "utf8");
    const missingHtmlPath = path.join(tempDir, "missing.html");
    await mkdir(path.dirname(sessionFilePath), { recursive: true });

    await writeFile(
      sessionFilePath,
      `${JSON.stringify(
        {
          entries: [
            {
              id: "keep",
              absPath: existingHtmlPath,
              title: "existing",
              addedAt: 1,
            },
            {
              id: "drop",
              absPath: missingHtmlPath,
              title: "missing",
              addedAt: 2,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const store = new SessionStore(sessionFilePath);
    const session = await store.load();

    expect(session.entries).toHaveLength(1);
    expect(session.entries[0]?.id).toBe("keep");
  });

  test("エントリを指定順に並べ替えて永続化する", async () => {
    const firstPath = path.join(tempDir, "first.html");
    const secondPath = path.join(tempDir, "second.html");
    await writeFile(firstPath, "<title>First</title>", "utf8");
    await writeFile(secondPath, "<title>Second</title>", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [first, second] = await store.addEntries([firstPath, secondPath]);

    await expect(store.reorderEntries([second.id, first.id])).resolves.toBe(
      true,
    );
    expect(store.getSession().entries.map((entry) => entry.id)).toEqual([
      second.id,
      first.id,
    ]);

    const restoredStore = new SessionStore(sessionFilePath);
    await expect(restoredStore.load()).resolves.toMatchObject({
      entries: [{ id: second.id }, { id: first.id }],
    });
  });

  test("並べ替えでIDの重複・欠落・不明なIDを拒否する", async () => {
    const firstPath = path.join(tempDir, "first.html");
    const secondPath = path.join(tempDir, "second.html");
    await writeFile(firstPath, "<title>First</title>", "utf8");
    await writeFile(secondPath, "<title>Second</title>", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [first] = await store.addEntries([firstPath, secondPath]);

    await expect(store.reorderEntries([first.id])).resolves.toBe(false);
    await expect(store.reorderEntries([first.id, first.id])).resolves.toBe(
      false,
    );
    await expect(store.reorderEntries([first.id, "unknown"])).resolves.toBe(
      false,
    );
    expect(store.getSession().entries.map((entry) => entry.id)).toEqual([
      first.id,
      expect.any(String),
    ]);
  });

  test("API で追加・一覧取得・個別削除・全削除ができる", async () => {
    const htmlPath = path.join(tempDir, "api.html");
    await writeFile(htmlPath, "<title>API</title><body>api</body>", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({ sessionStore: store });

    const addResponse = await app.inject({
      method: "POST",
      url: "/api/session/add",
      payload: { paths: [htmlPath] },
    });

    expect(addResponse.statusCode).toBe(201);
    const addedId = addResponse.json().added[0].id as string;

    const sessionResponse = await app.inject({
      method: "GET",
      url: "/api/session",
    });
    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json().entries).toHaveLength(1);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/session/${addedId}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const clearResponse = await app.inject({
      method: "DELETE",
      url: "/api/session",
    });
    expect(clearResponse.statusCode).toBe(204);

    await app.close();
  });

  test("healthでserver identityを返し、一致するserverだけを停止する", async () => {
    vi.useFakeTimers();
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const shutdown = vi.fn();
    const app = await createApp({
      sessionStore: store,
      shutdown,
      serverIdentity: {
        instanceId: "managed-instance",
        protocolVersion: 1,
      },
    });

    const healthResponse = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(healthResponse.json()).toMatchObject({
      name: "zatto",
      version: APP_VERSION,
      instanceId: "managed-instance",
      protocolVersion: 1,
    });

    const rejectedResponse = await app.inject({
      method: "POST",
      url: "/api/shutdown",
      headers: { "x-zatto-instance-id": "other-instance" },
    });
    expect(rejectedResponse.statusCode).toBe(409);

    const acceptedResponse = await app.inject({
      method: "POST",
      url: "/api/shutdown",
      headers: { "x-zatto-instance-id": "managed-instance" },
    });
    expect(acceptedResponse.statusCode).toBe(202);
    await vi.runAllTimersAsync();
    expect(shutdown).toHaveBeenCalledOnce();

    await app.close();
  });

  test("API で並べ替えて WebSocket に配信する", async () => {
    const firstPath = path.join(tempDir, "first.html");
    const secondPath = path.join(tempDir, "second.html");
    await writeFile(firstPath, "<title>First</title>", "utf8");
    await writeFile(secondPath, "<title>Second</title>", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [first, second] = await store.addEntries([firstPath, secondPath]);
    const app = await createApp({ sessionStore: store });
    await app.ready();
    const socket = await app.injectWS("/ws");
    const updatePromise = new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(data.toString()));
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/session/order",
      payload: { ids: [second.id, first.id] },
    });
    const message = JSON.parse(await updatePromise) as {
      type: string;
      entries: Array<{ id: string }>;
    };

    expect(response.statusCode).toBe(204);
    expect(message).toEqual({
      type: "session:update",
      entries: [second, first],
    });

    const duplicateResponse = await app.inject({
      method: "PATCH",
      url: "/api/session/order",
      payload: { ids: [first.id, first.id] },
    });
    const missingResponse = await app.inject({
      method: "PATCH",
      url: "/api/session/order",
      payload: { ids: [first.id] },
    });
    const unknownResponse = await app.inject({
      method: "PATCH",
      url: "/api/session/order",
      payload: { ids: [first.id, "unknown"] },
    });

    expect(duplicateResponse.statusCode).toBe(400);
    expect(missingResponse.statusCode).toBe(400);
    expect(unknownResponse.statusCode).toBe(400);

    socket.close();
    await app.close();
  });

  test("HTML と相対アセットを配信し、トラバーサルを拒否する", async () => {
    const assetDir = path.join(tempDir, "site");
    const htmlPath = path.join(assetDir, "index.html");
    const cssPath = path.join(assetDir, "app.css");
    const imagePath = path.join(assetDir, "logo.png");
    const outsidePath = path.join(tempDir, "secret.txt");
    await mkdir(assetDir, { recursive: true });

    await writeFile(
      htmlPath,
      '<!doctype html><html><head><title>Viewer</title><link rel="stylesheet" href="./app.css" /></head><body><img src="./logo.png" /></body></html>',
      "utf8",
    );
    await writeFile(cssPath, "body { color: red; }", "utf8");
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(outsidePath, "secret", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [entry] = await store.addEntries([htmlPath]);
    const app = await createApp({ sessionStore: store });

    const htmlResponse = await app.inject({
      method: "GET",
      url: `/f/${entry.id}/`,
    });
    expect(htmlResponse.statusCode).toBe(200);
    expect(htmlResponse.body).toContain("Viewer");
    expect(htmlResponse.body).not.toContain("/ws");

    const cssResponse = await app.inject({
      method: "GET",
      url: `/f/${entry.id}/app.css`,
    });
    expect(cssResponse.statusCode).toBe(200);
    expect(cssResponse.headers["content-type"]).toContain("text/css");

    const imageResponse = await app.inject({
      method: "GET",
      url: `/f/${entry.id}/logo.png`,
    });
    expect(imageResponse.statusCode).toBe(200);
    expect(imageResponse.rawPayload).toBeInstanceOf(Buffer);

    const traversalResponse = await app.inject({
      method: "GET",
      url: `/f/${entry.id}/..%2Fsecret.txt`,
    });
    expect(traversalResponse.statusCode).toBe(403);

    await app.close();
  });

  test("セッション変更を WebSocket で配信する", async () => {
    const htmlPath = path.join(tempDir, "realtime.html");
    await writeFile(htmlPath, "<title>Realtime</title>", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const realtimeHub = new RealtimeHub();
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
      method: "POST",
      url: "/api/session/add",
      payload: { paths: [htmlPath] },
    });
    const message = JSON.parse(await updatePromise) as {
      type: string;
      entries: Array<{ absPath: string }>;
    };

    expect(response.statusCode).toBe(201);
    expect(message).toMatchObject({
      type: "session:update",
      entries: [{ absPath: htmlPath }],
    });
    expect(onSessionChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ absPath: htmlPath })],
      }),
    );

    const addedId = response.json().added[0].id as string;
    const deleteUpdatePromise = new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(data.toString()));
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/session/${addedId}`,
    });
    const deleteMessage = JSON.parse(await deleteUpdatePromise) as {
      type: string;
      entries: unknown[];
    };

    expect(deleteResponse.statusCode).toBe(204);
    expect(deleteMessage).toEqual({
      type: "session:update",
      entries: [],
    });
    const restoredStore = new SessionStore(sessionFilePath);
    await expect(restoredStore.load()).resolves.toEqual({ entries: [] });
    expect(onSessionChanged).toHaveBeenCalledTimes(2);

    socket.close();
    await app.close();
  });

  test("ビルド済みフロントとアセットを配信する", async () => {
    const frontendRoot = path.join(tempDir, "dist", "web");
    const frontendIndexPath = path.join(frontendRoot, "index.html");
    await mkdir(path.join(frontendRoot, "assets"), { recursive: true });
    await writeFile(
      frontendIndexPath,
      '<div id="root"></div><script src="/assets/app.js"></script>',
      "utf8",
    );
    await writeFile(
      path.join(frontendRoot, "assets", "app.js"),
      "window.zatto = true;",
      "utf8",
    );

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({
      sessionStore: store,
      frontendDistPath: frontendIndexPath,
    });

    const indexResponse = await app.inject({ method: "GET", url: "/" });
    const assetResponse = await app.inject({
      method: "GET",
      url: "/assets/app.js",
    });
    const traversalResponse = await app.inject({
      method: "GET",
      url: "/assets/..%2Findex.html",
    });

    expect(indexResponse.statusCode).toBe(200);
    expect(indexResponse.body).toContain('id="root"');
    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.headers["content-type"]).toContain(
      "application/javascript",
    );
    expect(assetResponse.body).toContain("window.zatto");
    expect(traversalResponse.statusCode).toBe(403);

    await app.close();
  });

  test("shutdown エンドポイントで終了フックを呼ぶ", async () => {
    const shutdown = vi.fn();
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({ sessionStore: store, shutdown });
    vi.useFakeTimers();

    const response = await app.inject({
      method: "POST",
      url: "/api/shutdown",
    });
    expect(response.statusCode).toBe(202);

    vi.runAllTimers();
    expect(shutdown).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    await app.close();
  });

  test("GET / は暫定プレースホルダを返す", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toContain("Run the build first");

    await app.close();
  });

  test("health エンドポイントがバージョンを返す", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = await createApp({ sessionStore: store });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "zatto",
      version: APP_VERSION,
    });

    await app.close();
  });

  test("title が無い場合はファイル名を使う", async () => {
    const htmlPath = path.join(tempDir, "fallback.html");
    await writeFile(htmlPath, "<body>fallback</body>", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const [entry] = await store.addEntries([htmlPath]);

    expect(entry.title).toBe(path.basename(htmlPath));
  });
});
