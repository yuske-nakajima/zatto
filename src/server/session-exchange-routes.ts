import type { FastifyInstance } from "fastify";
import {
  createSessionExchange,
  parseSessionExchange,
  SessionExchangeValidationError,
} from "../shared/session-exchange.js";
import type { SessionStore } from "./session.js";
import { SessionImportValidationError } from "./session-import.js";

interface SessionExchangeRouteOptions {
  sessionStore: SessionStore;
  serverIdentity?: { instanceId: string };
  publishSessionUpdate: () => Promise<void>;
}

/**
 * Registers session import and export routes.
 *
 * @param app - Fastify application that owns the session API
 * @param options - Session authority, server identity, and update publisher
 * @returns Nothing after the routes are registered
 */
export function registerSessionExchangeRoutes(
  app: FastifyInstance,
  options: SessionExchangeRouteOptions,
): void {
  app.get("/api/session/export", async () => {
    return createSessionExchange(options.sessionStore.getSession().entries);
  });

  app.put<{ Body: unknown; Querystring: { mode?: string } }>(
    "/api/session",
    async (request, reply) => {
      if (
        options.serverIdentity &&
        request.headers["x-zatto-instance-id"] !==
          options.serverIdentity.instanceId
      ) {
        return reply
          .code(409)
          .send({ message: "サーバー識別子が一致しません" });
      }
      const mode = request.query.mode ?? "replace";
      if (mode !== "replace" && mode !== "merge") {
        return reply.code(400).send({ message: "import mode が不正です" });
      }
      try {
        const exchange = parseSessionExchange(request.body);
        const paths = exchange.entries.map((entry) => entry.path);
        const session =
          mode === "merge"
            ? await options.sessionStore.mergeEntries(paths)
            : await options.sessionStore.replaceEntries(paths);
        await options.publishSessionUpdate();
        return reply.code(200).send(session);
      } catch (error) {
        if (
          error instanceof SessionExchangeValidationError ||
          error instanceof SessionImportValidationError
        ) {
          return reply.code(400).send({ message: error.message });
        }
        throw error;
      }
    },
  );
}
