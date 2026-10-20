import type { FastifyInstance } from "fastify";
import type { SessionStore } from "./session.js";
import { readAsset, renderEntryHtml } from "./view.js";
/**
 * Serves active-workspace files and their relative assets.
 * @param app - HTTP application
 * @param store - Session authority
 * @returns Nothing
 * @throws When route registration fails
 */
export function registerViewRoutes(
  app: FastifyInstance,
  store: SessionStore,
): void {
  app.get<{ Params: { id: string } }>("/f/:id/", async (request, reply) => {
    const entry = request.remote
      ? store.findEntry(request.params.id)
      : store.getEntry(request.params.id);
    if (!entry) {
      return reply.code(404).send({ message: "エントリが見つかりません" });
    }

    const html = await renderEntryHtml(entry);
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get<{ Params: { id: string; "*": string } }>(
    "/f/:id/*",
    async (request, reply) => {
      const entry = request.remote
        ? store.findEntry(request.params.id)
        : store.getEntry(request.params.id);
      if (!entry) {
        return reply.code(404).send({ message: "エントリが見つかりません" });
      }

      const assetPath = decodeURIComponent(request.params["*"] ?? "");
      const asset = await readAsset(entry, assetPath);
      if (!asset) {
        return reply
          .code(403)
          .send({ message: "基点ディレクトリ外にはアクセスできません" });
      }

      return reply.type(asset.contentType).send(asset.body);
    },
  );
}
