import type { FastifyInstance } from "fastify";
import type { Commands } from "./commands/index.js";
import { dispatchRpc, failure } from "./rpc-dispatcher.js";
/**
 * Adapts HTTP JSON bodies to the shared command dispatcher.
 * @param app - HTTP transport
 * @param commands - Application command authority
 * @returns Nothing
 * @throws When route registration fails
 */
export function registerRpcRoute(
  app: FastifyInstance,
  commands: Commands,
): void {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body, done) => done(null, body),
  );
  app.post(
    "/rpc",
    {
      // 画像の添付（base64、1 コメント最大 4 枚×5MB）を受け付けるため既定の 1MiB から広げる
      bodyLimit: 32 * 1024 * 1024,
      onRequest: async (request, reply) => {
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            request.headers["content-type"] ?? "",
          )
        ) {
          return reply
            .code(415)
            .send(
              failure(null, -32600, "Content-Type must be application/json"),
            );
        }
      },
    },
    async (request, reply) => {
      let input: unknown;
      try {
        input = JSON.parse(String(request.body ?? ""));
      } catch {
        return reply.send(failure(null, -32700, "Parse error"));
      }
      const outcome = await dispatchRpc(
        input,
        commands,
        (error) => app.log.error(error),
        request.remote ? "remote" : "local",
      );
      if (outcome.effects.length)
        reply.raw.once("finish", () => {
          setImmediate(async () => {
            for (const effect of outcome.effects) {
              try {
                await effect();
              } catch (error) {
                app.log.error(error, "Deferred command effect failed");
              }
            }
          });
        });
      if (outcome.response === undefined) return reply.code(204).send();
      return reply.send(outcome.response);
    },
  );
}
