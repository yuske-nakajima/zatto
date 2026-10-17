import { fileURLToPath } from "node:url";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { APP_NAME, APP_VERSION } from "../meta.js";
import {
  AgentContextStore,
  registerAgentContextRoutes,
} from "./agent-context.js";
import { registerDocsRoute } from "./docs-route.js";
import type { PickDirectory, PickFiles } from "./file-picker.js";
import { RealtimeHub } from "./realtime.js";
import { registerSearchRoute } from "./search.js";
import type { Session, SessionStore } from "./session.js";
import { registerSessionEntryRoutes } from "./session-entry-routes.js";
import { registerSessionExchangeRoutes } from "./session-exchange-routes.js";
import { registerSessionPickerRoutes } from "./session-picker-routes.js";
import { registerStaticRoutes } from "./static-routes.js";
import { registerViewRoutes } from "./view-routes.js";
import { registerWorkspaceRoutes } from "./workspace-routes.js";
import { WorkspaceError } from "./workspace-state.js";

type CreateAppOptions = {
  sessionStore: SessionStore;
  shutdown?: () => Promise<void> | void;
  frontendDistPath?: string;
  realtimeHub?: RealtimeHub;
  pickFiles?: PickFiles;
  pickDirectory?: PickDirectory;
  onSessionChanged?: (session: Session) => Promise<void> | void;
  agentContextStore?: AgentContextStore;
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

  app.get("/ws", { websocket: true }, (socket) => {
    realtimeHub.add(socket);
  });

  registerStaticRoutes(app, options.frontendDistPath);

  registerDocsRoute(app, options.frontendDistPath);

  const agentContextStore =
    options.agentContextStore ?? new AgentContextStore();
  let publishedWorkspaceId =
    options.sessionStore.getWorkspaceState().activeWorkspaceId;
  registerWorkspaceRoutes(app, options.sessionStore, publishSessionUpdate);

  registerAgentContextRoutes(app, options.sessionStore, agentContextStore);

  app.get("/api/health", async () => {
    return {
      name: APP_NAME,
      version: APP_VERSION,
      ...options.serverIdentity,
    };
  });

  app.get("/api/session", async () => {
    return {
      ...options.sessionStore.getSession(),
      ...options.sessionStore.getWorkspaceState(),
      serverIdentity: options.serverIdentity
        ? { instanceId: options.serverIdentity.instanceId }
        : undefined,
      filePicker:
        options.pickFiles && options.serverIdentity
          ? {
              available: true,
              instanceId: options.serverIdentity.instanceId,
            }
          : { available: false },
      directoryPicker:
        options.pickDirectory && options.serverIdentity
          ? {
              available: true,
              instanceId: options.serverIdentity.instanceId,
            }
          : { available: false },
    };
  });

  registerSessionExchangeRoutes(app, {
    sessionStore: options.sessionStore,
    serverIdentity: options.serverIdentity,
    publishSessionUpdate,
  });

  registerSearchRoute(app, options.sessionStore);

  registerSessionPickerRoutes(app, {
    sessionStore: options.sessionStore,
    pickFiles: options.pickFiles,
    pickDirectory: options.pickDirectory,
    serverIdentity: options.serverIdentity,
    publishSessionUpdate,
  });

  registerSessionEntryRoutes(app, options.sessionStore, publishSessionUpdate);

  app.post("/api/shutdown", async (request, reply) => {
    if (
      options.serverIdentity &&
      request.headers["x-zatto-instance-id"] !==
        options.serverIdentity.instanceId
    ) {
      return reply.code(409).send({ message: "サーバー識別子が一致しません" });
    }
    setTimeout(async () => {
      await options.shutdown?.();
    }, 0);
    return reply.code(202).send({ ok: true });
  });

  registerViewRoutes(app, options.sessionStore);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkspaceError)
      return reply.code(409).send({ message: error.message });
    if (
      (error as { code?: unknown }).code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      return reply.code(400).send({ message: "JSON が不正です" });
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }
    app.log.error(error);
    return reply.code(500).send({ message: "サーバーエラー" });
  });

  let pendingPublication = Promise.resolve();
  function publishSessionUpdate(): Promise<void> {
    pendingPublication = pendingPublication.then(publishCommittedSession);
    return pendingPublication;
  }
  async function publishCommittedSession(): Promise<void> {
    const session = options.sessionStore.getSession();
    const workspaceState = options.sessionStore.getWorkspaceState();
    if (publishedWorkspaceId !== workspaceState.activeWorkspaceId) {
      agentContextStore.setBrowserContext({
        activeEntryId: null,
        view: "preview",
      });
      publishedWorkspaceId = workspaceState.activeWorkspaceId;
    }
    try {
      await options.onSessionChanged?.(session);
    } catch (error) {
      app.log.error(error, "セッション更新observerの実行に失敗しました");
    }
    try {
      realtimeHub.broadcast({
        type: "session:update",
        entries: session.entries,
        ...workspaceState,
      });
    } catch (error) {
      app.log.error(error, "セッション更新のWebSocket配信に失敗しました");
    }
  }

  return app;
}

export function defaultFrontendDistPath(): string {
  return fileURLToPath(new URL("../../dist/web/index.html", import.meta.url));
}

export async function closeAppAndExit(app: FastifyInstance): Promise<void> {
  await app.close();
  process.exit(0);
}
