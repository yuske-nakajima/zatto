import { fileURLToPath } from "node:url";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { AgentContextStore } from "./agent-context.js";
import { createCommands } from "./commands/index.js";
import { registerDocsRoute } from "./docs-route.js";
import type { PickDirectory, PickFiles } from "./file-picker.js";
import { RealtimeHub } from "./realtime.js";
import { registerReviewAttachmentRoute } from "./review-attachment-route.js";
import { ReviewStore } from "./review-store.js";
import { registerRpcRoute } from "./rpc-route.js";
import type { Session, SessionStore } from "./session.js";
import { registerStaticRoutes } from "./static-routes.js";
import { registerViewRoutes } from "./view-routes.js";

type CreateAppOptions = {
  sessionStore: SessionStore;
  shutdown?: () => Promise<void> | void;
  frontendDistPath?: string;
  realtimeHub?: RealtimeHub;
  pickFiles?: PickFiles;
  pickDirectory?: PickDirectory;
  onSessionChanged?: (session: Session) => Promise<void> | void;
  agentContextStore?: AgentContextStore;
  reviewStore?: ReviewStore;
  serverIdentity?: {
    instanceId: string;
    protocolVersion: number;
  };
};

export async function createApp(
  options: CreateAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify();
  const realtimeHub = options.realtimeHub ?? new RealtimeHub();
  await app.register(websocket);

  app.get<{ Querystring: { client?: string } }>(
    "/ws",
    { websocket: true },
    (socket, request) => {
      realtimeHub.add(
        socket,
        request.query.client === "viewer" ? "viewer" : "other",
      );
    },
  );

  registerStaticRoutes(app, options.frontendDistPath);

  registerDocsRoute(app, options.frontendDistPath);

  const agentContextStore =
    options.agentContextStore ?? new AgentContextStore();
  const reviewStore =
    options.reviewStore ?? new ReviewStore("", async () => undefined);
  registerRpcRoute(
    app,
    createCommands({
      ...options,
      agentContextStore,
      reviewStore,
      realtimeHub,
      logError: (error, message) => app.log.error(error, message),
    }),
  );

  registerViewRoutes(app, options.sessionStore);
  registerReviewAttachmentRoute(app, reviewStore);

  app.setErrorHandler((error, _request, reply) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }
    app.log.error(error);
    return reply.code(500).send({ message: "サーバーエラー" });
  });

  return app;
}

export function defaultFrontendDistPath(): string {
  return fileURLToPath(new URL("../../dist/web/index.html", import.meta.url));
}

export async function closeAppAndExit(app: FastifyInstance): Promise<void> {
  await app.close();
  process.exit(0);
}
