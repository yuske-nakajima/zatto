import { parseArgs } from "node:util";
import { createApp, defaultFrontendDistPath } from "./app.js";
import { RealtimeHub } from "./realtime.js";
import { SessionStore } from "./session.js";
import { EntryWatcher } from "./watch.js";

export const DEFAULT_PORT = 6280;

export async function startServer(port = DEFAULT_PORT) {
  const sessionStore = new SessionStore(process.env.ZATTO_SESSION_FILE);
  await sessionStore.load();
  const realtimeHub = new RealtimeHub();
  const entryWatcher = new EntryWatcher((id) => {
    realtimeHub.broadcast({ type: "file:changed", id });
  });
  entryWatcher.sync(sessionStore.getSession().entries);

  const app = await createApp({
    sessionStore,
    realtimeHub,
    frontendDistPath: defaultFrontendDistPath(),
    onSessionChanged: (session) => {
      entryWatcher.sync(session.entries);
    },
    shutdown: async () => {
      await app.close();
      process.exit(0);
    },
  });
  app.addHook("onClose", async () => {
    await entryWatcher.close();
  });

  await app.listen({
    host: "127.0.0.1",
    port,
  });

  return { app, entryWatcher, realtimeHub, sessionStore };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
    },
  });
  const port = Number(values.port);

  startServer(port).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
