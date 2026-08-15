import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { contentTypeForPath } from "./view.js";

/**
 * Registers static delivery for documentation included in the frontend build.
 *
 * @param app - Fastify application that serves the web frontend
 * @param frontendDistPath - Path to the frontend build's index document
 * @returns Nothing after the route is registered
 */
export function registerDocsRoute(
  app: FastifyInstance,
  frontendDistPath: string | undefined,
): void {
  app.get<{ Params: { "*": string } }>("/docs/*", async (request, reply) => {
    if (!frontendDistPath) {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }

    const docsRoot = path.resolve(path.dirname(frontendDistPath), "docs");
    const requestedPath = path.resolve(docsRoot, request.params["*"] ?? "");
    if (!isPathInsideRoot(docsRoot, requestedPath)) {
      return reply
        .code(403)
        .send({ message: "ドキュメントディレクトリ外にはアクセスできません" });
    }

    const [resolvedDocsRoot, resolvedRequestedPath] = await Promise.all([
      realpath(docsRoot),
      realpath(requestedPath),
    ]);
    if (!isPathInsideRoot(resolvedDocsRoot, resolvedRequestedPath)) {
      return reply
        .code(403)
        .send({ message: "ドキュメントディレクトリ外にはアクセスできません" });
    }

    const body = await readFile(resolvedRequestedPath);
    return reply.type(contentTypeForPath(resolvedRequestedPath)).send(body);
  });
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}
