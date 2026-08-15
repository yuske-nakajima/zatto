import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";

describe("組み込みドキュメント配信", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-docs-route-"));
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("frontend build配下のドキュメントをMIME付きで配信する", async () => {
    const frontendRoot = path.join(tempDir, "dist", "web");
    const frontendIndexPath = path.join(frontendRoot, "index.html");
    await mkdir(path.join(frontendRoot, "docs", "en"), { recursive: true });
    await writeFile(frontendIndexPath, "<main>zatto</main>", "utf8");
    await writeFile(
      path.join(frontendRoot, "docs", "en", "getting-started.html"),
      "<!doctype html><title>Getting started</title>",
      "utf8",
    );
    await writeFile(
      path.join(frontendRoot, "docs", "theme.css"),
      "body { color: CanvasText; }",
      "utf8",
    );

    const app = await createTestApp(frontendIndexPath);
    const pageResponse = await app.inject({
      method: "GET",
      url: "/docs/en/getting-started.html",
    });
    const styleResponse = await app.inject({
      method: "GET",
      url: "/docs/theme.css",
    });

    expect(pageResponse.statusCode).toBe(200);
    expect(pageResponse.headers["content-type"]).toContain("text/html");
    expect(pageResponse.body).toContain("Getting started");
    expect(styleResponse.statusCode).toBe(200);
    expect(styleResponse.headers["content-type"]).toContain("text/css");
    await app.close();
  });

  test("未設定、空パス、基点外アクセス、存在しないファイルを拒否する", async () => {
    const frontendRoot = path.join(tempDir, "dist", "web");
    const frontendIndexPath = path.join(frontendRoot, "index.html");
    await mkdir(path.join(frontendRoot, "docs"), { recursive: true });
    await writeFile(frontendIndexPath, "<main>secret</main>", "utf8");

    const app = await createTestApp(frontendIndexPath);
    const noFrontendApp = await createTestApp();
    const emptyResponse = await app.inject({ method: "GET", url: "/docs/" });
    const traversalResponse = await app.inject({
      method: "GET",
      url: "/docs/..%2Findex.html",
    });
    const missingResponse = await app.inject({
      method: "GET",
      url: "/docs/en/missing.html",
    });
    const unavailableResponse = await noFrontendApp.inject({
      method: "GET",
      url: "/docs/en/getting-started.html",
    });

    expect(emptyResponse.statusCode).toBe(403);
    expect(traversalResponse.statusCode).toBe(403);
    expect(traversalResponse.body).not.toContain("secret");
    expect(missingResponse.statusCode).toBe(404);
    expect(unavailableResponse.statusCode).toBe(404);
    await app.close();
    await noFrontendApp.close();
  });

  test("docs配下のsymlinkから基点外ファイルを配信しない", async () => {
    const frontendRoot = path.join(tempDir, "dist", "web");
    const frontendIndexPath = path.join(frontendRoot, "index.html");
    const docsRoot = path.join(frontendRoot, "docs");
    const secretPath = path.join(tempDir, "secret.html");
    await mkdir(docsRoot, { recursive: true });
    await writeFile(frontendIndexPath, "<main>zatto</main>", "utf8");
    await writeFile(secretPath, "external-secret", "utf8");
    await symlink(secretPath, path.join(docsRoot, "linked.html"));

    const app = await createTestApp(frontendIndexPath);
    const response = await app.inject({
      method: "GET",
      url: "/docs/linked.html",
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain("external-secret");
    await app.close();
  });

  test("docs配下のディレクトリsymlinkから基点外ファイルを配信しない", async () => {
    const frontendRoot = path.join(tempDir, "dist", "web");
    const frontendIndexPath = path.join(frontendRoot, "index.html");
    const docsRoot = path.join(frontendRoot, "docs");
    const outsideDirectory = path.join(tempDir, "outside-docs");
    await mkdir(docsRoot, { recursive: true });
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(frontendIndexPath, "<main>zatto</main>", "utf8");
    await writeFile(
      path.join(outsideDirectory, "secret.html"),
      "directory-secret",
      "utf8",
    );
    await symlink(outsideDirectory, path.join(docsRoot, "linked-directory"));

    const app = await createTestApp(frontendIndexPath);
    const response = await app.inject({
      method: "GET",
      url: "/docs/linked-directory/secret.html",
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain("directory-secret");
    await app.close();
  });

  async function createTestApp(frontendDistPath?: string) {
    const store = new SessionStore(path.join(tempDir, crypto.randomUUID()));
    await store.load();
    return createApp({ sessionStore: store, frontendDistPath });
  }
});
