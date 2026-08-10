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

  app.put<{ Body: unknown }>("/api/session", async (request, reply) => {
    if (
      options.serverIdentity &&
      request.headers["x-zatto-instance-id"] !==
        options.serverIdentity.instanceId
    ) {
      return reply.code(409).send({ message: "サーバー識別子が一致しません" });
    }
    try {
      const exchange = parseSessionExchange(request.body);
      const session = await options.sessionStore.replaceEntries(
        exchange.entries.map((entry) => entry.path),
      );
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
  });
}
