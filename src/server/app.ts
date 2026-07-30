import { readFile } from "node:fs/promises";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { APP_NAME, APP_VERSION } from "../meta.js";
import { RealtimeHub } from "./realtime.js";
import { fileExists, type Session, type SessionStore } from "./session.js";
import { contentTypeForPath, readAsset, renderEntryHtml } from "./view.js";

type CreateAppOptions = {
  sessionStore: SessionStore;
  shutdown?: () => Promise<void> | void;
  frontendDistPath?: string;
  realtimeHub?: RealtimeHub;
  onSessionChanged?: (session: Session) => Promise<void> | void;
};

type AddSessionBody = {
  paths?: string[];
};

type ReorderSessionBody = {
  ids?: string[];
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

  app.get("/", async (_request, reply) => {
    if (
      options.frontendDistPath &&
      (await fileExists(options.frontendDistPath))
    ) {
      const html = await readFile(options.frontendDistPath, "utf8");
      return reply.type("text/html; charset=utf-8").send(html);
    }

    return reply
      .code(503)
      .type("text/html; charset=utf-8")
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>zatto</title>
  </head>
  <body>
    <main>
      <h1>zatto server is running</h1>
      <p>Frontend not found. Run the build first.</p>
    </main>
  </body>
</html>`);
  });

  app.get<{ Params: { "*": string } }>("/assets/*", async (request, reply) => {
    if (!options.frontendDistPath) {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }

    const distRoot = path.dirname(options.frontendDistPath);
    const assetsRoot = path.resolve(distRoot, "assets");
    const assetPath = path.resolve(assetsRoot, request.params["*"] ?? "");
    const relativePath = path.relative(assetsRoot, assetPath);
    if (
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath) ||
      relativePath === ""
    ) {
      return reply
        .code(403)
        .send({ message: "アセットディレクトリ外にはアクセスできません" });
    }

    const body = await readFile(assetPath);
    return reply.type(contentTypeForPath(assetPath)).send(body);
  });

  app.get("/api/health", async () => {
    return { name: APP_NAME, version: APP_VERSION };
  });

  app.get("/api/session", async () => {
    return options.sessionStore.getSession();
  });

  app.post<{ Body: AddSessionBody }>(
    "/api/session/add",
    async (request, reply) => {
      const rawPaths = request.body?.paths;
      if (!Array.isArray(rawPaths)) {
        return reply
          .code(400)
          .send({ message: "`paths` は配列である必要があります" });
      }

      const normalizedPaths = rawPaths
        .filter(
          (input): input is string =>
            typeof input === "string" && input.length > 0,
        )
        .map((input) => resolve(input));

      const addedEntries =
        await options.sessionStore.addEntries(normalizedPaths);
      if (addedEntries.length > 0) {
        await publishSessionUpdate();
      }
      return reply.code(201).send({
        added: addedEntries,
        session: options.sessionStore.getSession(),
      });
    },
  );

  app.patch<{ Body: ReorderSessionBody }>(
    "/api/session/order",
    async (request, reply) => {
      const ids = request.body?.ids;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return reply
          .code(400)
          .send({ message: "`ids` は文字列の配列である必要があります" });
      }

      const reordered = await options.sessionStore.reorderEntries(ids);
      if (!reordered) {
        return reply.code(400).send({
          message: "`ids` には現在の全エントリを重複なく指定してください",
        });
      }

      await publishSessionUpdate();
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/session/:id",
    async (request, reply) => {
      const removed = await options.sessionStore.removeEntry(request.params.id);
      if (!removed) {
        return reply.code(404).send({ message: "エントリが見つかりません" });
      }
      await publishSessionUpdate();
      return reply.code(204).send();
    },
  );

  app.delete("/api/session", async (_request, reply) => {
    const hadEntries = options.sessionStore.getSession().entries.length > 0;
    await options.sessionStore.clear();
    if (hadEntries) {
      await publishSessionUpdate();
    }
    return reply.code(204).send();
  });

  app.post("/api/shutdown", async (_request, reply) => {
    setTimeout(async () => {
      await options.shutdown?.();
    }, 0);
    return reply.code(202).send({ ok: true });
  });

  app.get<{ Params: { id: string } }>("/f/:id/", async (request, reply) => {
    const entry = options.sessionStore.getEntry(request.params.id);
    if (!entry) {
      return reply.code(404).send({ message: "エントリが見つかりません" });
    }

    const html = await renderEntryHtml(entry);
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get<{ Params: { id: string; "*": string } }>(
    "/f/:id/*",
    async (request, reply) => {
      const entry = options.sessionStore.getEntry(request.params.id);
      if (!entry) {
        return reply.code(404).send({ message: "エントリが見つかりません" });
      }

      const assetPath = decodeURIComponent(request.params["*"] ?? "");
      const asset = await readAsset(entry, assetPath);
      if (!asset) {
        return reply
          .code(403)
          .send({ message: "基点ディレクトリ外にはアクセスできません" });
      }

      return reply.type(asset.contentType).send(asset.body);
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }
    app.log.error(error);
    return reply.code(500).send({ message: "サーバーエラー" });
  });

  async function publishSessionUpdate(): Promise<void> {
    const session = options.sessionStore.getSession();
    await options.onSessionChanged?.(session);
    realtimeHub.broadcast({
      type: "session:update",
      entries: session.entries,
    });
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
