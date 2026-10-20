import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { createApp, defaultFrontendDistPath } from "./app.js";
import { runServerCommand } from "./command.js";
import { isDirectExecution } from "./direct-execution.js";
import {
  createNativeDirectoryPicker,
  createNativeFilePicker,
} from "./file-picker.js";
import { RealtimeHub } from "./realtime.js";
import { ReviewStore } from "./review-store.js";
import {
  acquireServerLock,
  releaseServerRuntime,
  resolveRuntimeFilePath,
  SERVER_PROTOCOL_VERSION,
  type ServerRecord,
  updateServerLockState,
  writeServerRecord,
} from "./runtime.js";
import { DEFAULT_SESSION_FILE, SessionStore } from "./session.js";
import { EntryWatcher } from "./watch.js";

/** CLIから指定されない場合にサーバーが使用するポート。 */
export const DEFAULT_PORT = 6280;
const HEARTBEAT_INTERVAL_MS = 2_000;

/** サーバーの起動方法とruntime保存先を指定するオプション。 */
export interface StartServerOptions {
  exit?: (code: number) => void;
  instanceId?: string;
  runtimeFilePath?: string;
  sessionFilePath?: string;
  /** 外の端末からの閲覧を受け付けるアドレス。省略時は 127.0.0.1 だけで待ち受ける。 */
  host?: string;
  writeRuntimeRecord?: (
    runtimeFilePath: string,
    record: ServerRecord,
  ) => Promise<void>;
}

/**
 * runtime lockを取得し、zattoサーバーを起動する。
 *
 * @param preferredPort - 最初に使用を試みるポート。0の場合はOSが割り当てる
 * @param options - runtimeとセッションの起動設定
 * @returns 起動したサーバー。runtime lockを取得できない場合はnull
 * @throws サーバーの初期化またはruntime recordの保存に失敗した場合
 */
export async function startServer(
  preferredPort = DEFAULT_PORT,
  options: StartServerOptions = {},
) {
  const instanceId = options.instanceId ?? randomUUID();
  const processFingerprint = randomUUID();
  const runtimeFilePath = options.runtimeFilePath ?? resolveRuntimeFilePath();
  const locked = await acquireServerLock(runtimeFilePath, {
    instanceId,
    pid: process.pid,
    processFingerprint,
  });
  if (!locked) {
    return null;
  }

  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let entryWatcher: EntryWatcher | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let heartbeatUpdate = Promise.resolve(true);
  let runtimeOwned = true;
  try {
    const sessionFilePath =
      options.sessionFilePath ??
      process.env.ZATTO_SESSION_FILE ??
      DEFAULT_SESSION_FILE;
    const sessionStore = new SessionStore(sessionFilePath);
    await sessionStore.load();
    const reviewStore = new ReviewStore(
      path.join(path.dirname(sessionFilePath), "threads.json"),
    );
    await reviewStore.load((id) => sessionStore.hasEntry(id));
    const realtimeHub = new RealtimeHub();
    const createdEntryWatcher = new EntryWatcher((id) => {
      realtimeHub.broadcast({ type: "file:changed", id });
    });
    entryWatcher = createdEntryWatcher;
    createdEntryWatcher.sync(sessionStore.getSession().entries);

    const remote = options.host
      ? { host: options.host, token: randomBytes(24).toString("base64url") }
      : undefined;
    const createdApp = await createApp({
      remote,
      sessionStore,
      reviewStore,
      pickFiles: createNativeFilePicker(),
      pickDirectory: createNativeDirectoryPicker(),
      realtimeHub,
      frontendDistPath: defaultFrontendDistPath(),
      serverIdentity: {
        instanceId,
        protocolVersion: SERVER_PROTOCOL_VERSION,
      },
      onSessionChanged: (session) => {
        createdEntryWatcher.sync(session.entries);
      },
      shutdown: async () => {
        await createdApp.close();
        (options.exit ?? process.exit)(0);
      },
    });
    app = createdApp;
    const stopForSignal = () => {
      void createdApp.close().finally(() => (options.exit ?? process.exit)(0));
    };
    process.once("SIGINT", stopForSignal);
    process.once("SIGTERM", stopForSignal);
    createdApp.addHook("onClose", async () => {
      process.off("SIGINT", stopForSignal);
      process.off("SIGTERM", stopForSignal);
      await createdEntryWatcher.close();
      if (heartbeat) clearInterval(heartbeat);
      if (runtimeOwned) {
        await releaseServerRuntime(
          runtimeFilePath,
          instanceId,
          processFingerprint,
        );
      }
    });

    const wildcard = remote !== undefined && WILDCARD_HOSTS.has(remote.host);
    let remoteServer: Server | undefined;
    const remoteSockets = new Set<Socket>();
    // Fastify は待ち受けを始めたあとにフックを登録できないため、先に登録する
    createdApp.addHook("onClose", async () => {
      const server = remoteServer;
      if (!server) return;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // WebSocket へ切り替えた接続は closeAllConnections の対象外のため、自分で閉じる
        for (const socket of remoteSockets) socket.destroy();
      });
    });
    const port = await listenWithFallback(
      createdApp,
      preferredPort,
      wildcard ? remote.host : "127.0.0.1",
    );
    if (remote && !wildcard) {
      remoteServer = await listenRemote(createdApp, remote.host, port);
      remoteServer.on("connection", (socket) => {
        remoteSockets.add(socket);
        socket.once("close", () => remoteSockets.delete(socket));
      });
    }
    const ownsRuntime = await updateServerLockState(
      runtimeFilePath,
      processFingerprint,
      {
        heartbeatAt: Date.now(),
        port,
        protocolVersion: SERVER_PROTOCOL_VERSION,
      },
    );
    if (!ownsRuntime) {
      runtimeOwned = false;
      throw new Error("zatto サーバーのruntime所有権を失いました");
    }
    await (options.writeRuntimeRecord ?? writeServerRecord)(runtimeFilePath, {
      instanceId,
      processFingerprint,
      pid: process.pid,
      port,
      protocolVersion: SERVER_PROTOCOL_VERSION,
      ...(remote ? { remote } : {}),
    });
    heartbeat = setInterval(() => {
      heartbeatUpdate = heartbeatUpdate
        .then(() =>
          updateServerLockState(runtimeFilePath, processFingerprint, {
            heartbeatAt: Date.now(),
          }),
        )
        .catch(() => false);
      void heartbeatUpdate.then((owned) => {
        if (!owned) {
          runtimeOwned = false;
          void createdApp.close();
        }
      });
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();

    return {
      app: createdApp,
      entryWatcher: createdEntryWatcher,
      realtimeHub,
      sessionStore,
      port,
    };
  } catch (error) {
    if (app) {
      await app.close().catch(() => undefined);
    } else {
      await entryWatcher?.close().catch(() => undefined);
    }
    if (runtimeOwned) {
      await releaseServerRuntime(
        runtimeFilePath,
        instanceId,
        processFingerprint,
      );
    }
    throw error;
  }
}

/** すべてのアドレスで待ち受けるホスト。ループバックも含むため、別の待ち受けを作らない。 */
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

async function listenWithFallback(
  app: Awaited<ReturnType<typeof createApp>>,
  preferredPort: number,
  host: string,
): Promise<number> {
  try {
    await app.listen({ host, port: preferredPort });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
      throw error;
    }
    await app.listen({ host, port: 0 });
  }

  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("zatto サーバーの待受ポートを取得できませんでした");
  }
  return address.port;
}

/**
 * 127.0.0.1 と同じポートで、外の端末向けのアドレスでも待ち受ける。
 * Fastify は 1 つのアドレスでしか待ち受けないため、要求と WebSocket の upgrade を同じアプリへ渡す。
 * @param app - 127.0.0.1 で待ち受けているアプリ
 * @param host - 外の端末向けのアドレス
 * @param port - 127.0.0.1 で待ち受けているポート
 * @returns 外の端末向けのサーバー
 * @throws 待ち受けに失敗した場合
 */
async function listenRemote(
  app: Awaited<ReturnType<typeof createApp>>,
  host: string,
  port: number,
): Promise<Server> {
  const server = createServer((request, response) =>
    app.routing(request, response),
  );
  server.on("upgrade", (request, socket, head) => {
    app.server.emit("upgrade", request, socket, head);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runServerCommand(startServer, DEFAULT_PORT, process.argv.slice(2));
}
