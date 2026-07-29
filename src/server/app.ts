import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { APP_NAME, APP_VERSION } from "../meta.js";
import { fileExists, type SessionStore } from "./session.js";
import { readAsset, renderEntryHtml } from "./view.js";

type CreateAppOptions = {
  sessionStore: SessionStore;
  shutdown?: () => Promise<void> | void;
  frontendDistPath?: string;
};

type AddSessionBody = {
  paths?: string[];
};

export function createApp(options: CreateAppOptions): FastifyInstance {
  const app = Fastify();

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
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>zatto</title>
  </head>
  <body>
    <main>
      <h1>zatto サーバーは起動中です</h1>
      <p>フロントエンドは Issue #4 で実装されます。</p>
    </main>
  </body>
</html>`);
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
      return reply.code(201).send({
        added: addedEntries,
        session: options.sessionStore.getSession(),
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/session/:id",
    async (request, reply) => {
      const removed = await options.sessionStore.removeEntry(request.params.id);
      if (!removed) {
        return reply.code(404).send({ message: "エントリが見つかりません" });
      }
      return reply.code(204).send();
    },
  );

  app.delete("/api/session", async (_request, reply) => {
    await options.sessionStore.clear();
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

  return app;
}

export function defaultFrontendDistPath(): string {
  return resolve(process.cwd(), "dist", "web", "index.html");
}

export async function closeAppAndExit(app: FastifyInstance): Promise<void> {
  await app.close();
  process.exit(0);
}
