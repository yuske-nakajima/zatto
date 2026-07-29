import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
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

  test("API で追加・一覧取得・個別削除・全削除ができる", async () => {
    const htmlPath = path.join(tempDir, "api.html");
    await writeFile(htmlPath, "<title>API</title><body>api</body>", "utf8");

    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = createApp({ sessionStore: store });

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
    const app = createApp({ sessionStore: store });

    const htmlResponse = await app.inject({
      method: "GET",
      url: `/f/${entry.id}/`,
    });
    expect(htmlResponse.statusCode).toBe(200);
    expect(htmlResponse.body).toContain("Viewer");
    expect(htmlResponse.body).toContain("/ws");

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

  test("shutdown エンドポイントで終了フックを呼ぶ", async () => {
    const shutdown = vi.fn();
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = createApp({ sessionStore: store, shutdown });
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
    const app = createApp({ sessionStore: store });

    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toContain("Issue #4");

    await app.close();
  });

  test("health エンドポイントがバージョンを返す", async () => {
    const store = new SessionStore(sessionFilePath);
    await store.load();
    const app = createApp({ sessionStore: store });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "zatto",
      version: "0.1.0",
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
