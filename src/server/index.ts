import { parseArgs } from "node:util";
import { createApp, defaultFrontendDistPath } from "./app.js";
import { SessionStore } from "./session.js";

export const DEFAULT_PORT = 6280;

export async function startServer(port = DEFAULT_PORT) {
  const sessionStore = new SessionStore();
  await sessionStore.load();

  const app = createApp({
    sessionStore,
    frontendDistPath: defaultFrontendDistPath(),
    shutdown: async () => {
      await app.close();
      process.exit(0);
    },
  });

  await app.listen({
    host: "127.0.0.1",
    port,
  });

  return { app, sessionStore };
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
