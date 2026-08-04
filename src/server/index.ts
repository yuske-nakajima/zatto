import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { createApp, defaultFrontendDistPath } from "./app.js";
import { createNativeFilePicker } from "./file-picker.js";
import { RealtimeHub } from "./realtime.js";
import {
  acquireServerLock,
  releaseServerRuntime,
  resolveRuntimeFilePath,
  SERVER_PROTOCOL_VERSION,
  type ServerRecord,
  updateServerLockState,
  writeServerRecord,
} from "./runtime.js";
import { SessionStore } from "./session.js";
import { EntryWatcher } from "./watch.js";

export const DEFAULT_PORT = 6280;
const HEARTBEAT_INTERVAL_MS = 2_000;

interface StartServerOptions {
  exit?: (code: number) => void;
  instanceId?: string;
  runtimeFilePath?: string;
  sessionFilePath?: string;
  writeRuntimeRecord?: (
    runtimeFilePath: string,
    record: ServerRecord,
  ) => Promise<void>;
}

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
    const sessionStore = new SessionStore(
      options.sessionFilePath ?? process.env.ZATTO_SESSION_FILE,
    );
    await sessionStore.load();
    const realtimeHub = new RealtimeHub();
    const createdEntryWatcher = new EntryWatcher((id) => {
      realtimeHub.broadcast({ type: "file:changed", id });
    });
    entryWatcher = createdEntryWatcher;
    createdEntryWatcher.sync(sessionStore.getSession().entries);

    const createdApp = await createApp({
      sessionStore,
      pickFiles: createNativeFilePicker(),
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

    const port = await listenWithFallback(createdApp, preferredPort);
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

async function listenWithFallback(
  app: Awaited<ReturnType<typeof createApp>>,
  preferredPort: number,
): Promise<number> {
  try {
    await app.listen({ host: "127.0.0.1", port: preferredPort });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
      throw error;
    }
    await app.listen({ host: "127.0.0.1", port: 0 });
  }

  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("zatto サーバーの待受ポートを取得できませんでした");
  }
  return address.port;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
      "instance-id": { type: "string" },
      "runtime-file": { type: "string" },
    },
  });
  const port = Number(values.port);

  startServer(port, {
    instanceId: values["instance-id"],
    runtimeFilePath: values["runtime-file"],
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
