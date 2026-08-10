import { readFile } from "node:fs/promises";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { APP_NAME, APP_VERSION } from "../meta.js";
import type { PickFiles } from "./file-picker.js";
import { RealtimeHub } from "./realtime.js";
import { registerSearchRoute } from "./search.js";
import { fileExists, type Session, type SessionStore } from "./session.js";
import { registerSessionExchangeRoutes } from "./session-exchange-routes.js";
import { contentTypeForPath, readAsset, renderEntryHtml } from "./view.js";

type CreateAppOptions = {
  sessionStore: SessionStore;
  shutdown?: () => Promise<void> | void;
  frontendDistPath?: string;
  realtimeHub?: RealtimeHub;
  pickFiles?: PickFiles;
  onSessionChanged?: (session: Session) => Promise<void> | void;
  serverIdentity?: {
    instanceId: string;
    protocolVersion: number;
  };
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
  let filePickerActive = false;
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

  app.get("/manifest.webmanifest", async (_request, reply) => {
    if (!options.frontendDistPath) {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }

    const manifestPath = path.join(
      path.dirname(options.frontendDistPath),
      "manifest.webmanifest",
    );
    if (!(await fileExists(manifestPath))) {
      return reply.code(404).send({ message: "ファイルが見つかりません" });
    }

    const manifest = await readFile(manifestPath, "utf8");
    return reply.type(contentTypeForPath(manifestPath)).send(manifest);
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
    return {
      name: APP_NAME,
      version: APP_VERSION,
      ...options.serverIdentity,
    };
  });

  app.get("/api/session", async () => {
    return {
      ...options.sessionStore.getSession(),
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
    };
  });

  registerSessionExchangeRoutes(app, {
    sessionStore: options.sessionStore,
    serverIdentity: options.serverIdentity,
    publishSessionUpdate,
  });

  registerSearchRoute(app, options.sessionStore);

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

  app.post("/api/session/pick", async (request, reply) => {
    if (
      !options.serverIdentity ||
      request.headers["x-zatto-instance-id"] !==
        options.serverIdentity.instanceId
    ) {
      return reply.code(409).send({ message: "サーバー識別子が一致しません" });
    }
    if (!options.pickFiles) {
      return reply.code(501).send({ message: "ファイル選択を利用できません" });
    }
    if (filePickerActive) {
      return reply
        .code(409)
        .send({ message: "ファイル選択ダイアログはすでに開いています" });
    }

    filePickerActive = true;
    try {
      const result = await options.pickFiles();
      if (result.kind === "cancelled") {
        return reply.code(200).send({ cancelled: true, added: [] });
      }
      const htmlPaths = result.paths.filter(isHtmlPath);
      const addedEntries = await options.sessionStore.addEntries(htmlPaths);
      if (addedEntries.length > 0) {
        await publishSessionUpdate();
      }
      return reply.code(201).send({
        cancelled: false,
        added: addedEntries,
        session: options.sessionStore.getSession(),
      });
    } finally {
      filePickerActive = false;
    }
  });

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

  async function publishSessionUpdate(): Promise<void> {
    const session = options.sessionStore.getSession();
    try {
      await options.onSessionChanged?.(session);
    } catch (error) {
      app.log.error(error, "セッション更新observerの実行に失敗しました");
    }
    try {
      realtimeHub.broadcast({
        type: "session:update",
        entries: session.entries,
      });
    } catch (error) {
      app.log.error(error, "セッション更新のWebSocket配信に失敗しました");
    }
  }

  return app;
}

function isHtmlPath(filePath: string): boolean {
  return [".htm", ".html"].includes(path.extname(filePath).toLowerCase());
}

export function defaultFrontendDistPath(): string {
  return fileURLToPath(new URL("../../dist/web/index.html", import.meta.url));
}

export async function closeAppAndExit(app: FastifyInstance): Promise<void> {
  await app.close();
  process.exit(0);
}
