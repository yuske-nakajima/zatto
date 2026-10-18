import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { ReviewStore } from "./review-store.js";
/**
 * Serves images attached to review comments; only files referenced by a stored comment are readable.
 * @param app - HTTP application
 * @param store - Review thread authority
 * @returns Nothing
 * @throws When route registration fails
 */
export function registerReviewAttachmentRoute(
  app: FastifyInstance,
  store: ReviewStore,
): void {
  app.get<{ Params: { file: string } }>(
    "/review-attachments/:file",
    async (request, reply) => {
      const attachment = store.attachment(request.params.file);
      if (!attachment)
        return reply.code(404).send({ message: "画像が見つかりません" });
      return reply
        .type(attachment.type)
        .header("cache-control", "private, max-age=31536000, immutable")
        .send(await readFile(attachment.path));
    },
  );
}
