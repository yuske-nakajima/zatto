import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { fileExists } from "./session-files.js";
import { contentTypeForPath } from "./view.js";

/**
 * Serves the application shell and bundled assets.
 * @param app - HTTP application
 * @param frontendDistPath - Built application index
 * @returns Nothing
 * @throws When registration fails
 */
export function registerStaticRoutes(
  app: FastifyInstance,
  frontendDistPath?: string,
): void {
  app.get("/", async (_request, reply) => {
    if (frontendDistPath && (await fileExists(frontendDistPath))) {
      const html = await readFile(frontendDistPath, "utf8");
      return reply.type("text/html; charset=utf-8").send(html);
    }

    return reply
      .code(503)
      .type("text/html; charset=utf-8")
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>zatto</title>
  </head>
  <body>
    <main>
      <h1>zatto server is running</h1>
      <p>Frontend not found. Run the build first.</p>
    </main>
  </body>
</html>`);
  });

  app.get("/manifest.webmanifest", async (_request, reply) => {
    if (!frontendDistPath) {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }

    const manifestPath = path.join(
      path.dirname(frontendDistPath),
      "manifest.webmanifest",
    );
    if (!(await fileExists(manifestPath))) {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }

    const manifest = await readFile(manifestPath, "utf8");
    return reply.type(contentTypeForPath(manifestPath)).send(manifest);
  });

  app.get<{ Params: { "*": string } }>("/assets/*", async (request, reply) => {
    if (!frontendDistPath) {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }

    const distRoot = path.dirname(frontendDistPath);
    const assetsRoot = path.resolve(distRoot, "assets");
    const assetPath = path.resolve(assetsRoot, request.params["*"] ?? "");
    const relativePath = path.relative(assetsRoot, assetPath);
    if (
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath) ||
      relativePath === ""
    ) {
      return reply
        .code(403)
        .send({ message: "アセットディレクトリ外にはアクセスできません" });
    }

    const body = await readFile(assetPath);
    return reply.type(contentTypeForPath(assetPath)).send(body);
  });
}
