import type { FastifyInstance } from "fastify";
import {
  type DirectoryImportMode,
  enumerateHtmlFiles,
} from "./directory-import.js";
import type { PickDirectory, PickFiles } from "./file-picker.js";
import type { SessionStore } from "./session.js";

interface SessionPickerRouteOptions {
  sessionStore: SessionStore;
  pickFiles?: PickFiles;
  pickDirectory?: PickDirectory;
  serverIdentity?: { instanceId: string };
  publishSessionUpdate: () => Promise<void>;
}

interface DirectoryPickerBody {
  mode?: unknown;
}

/**
 * Registers file and directory picker routes with one shared native-dialog lock.
 *
 * @param app - Fastify application that owns the session API
 * @param options - Picker capabilities, session authority, and update publisher
 * @returns Nothing after the routes are registered
 */
export function registerSessionPickerRoutes(
  app: FastifyInstance,
  options: SessionPickerRouteOptions,
): void {
  let nativePickerActive = false;

  app.post("/api/session/pick", async (request, reply) => {
    if (!hasMatchingIdentity(request.headers, options.serverIdentity)) {
      return reply.code(409).send({ message: "サーバー識別子が一致しません" });
    }
    if (!options.pickFiles) {
      return reply.code(501).send({ message: "ファイル選択を利用できません" });
    }
    if (nativePickerActive) {
      return reply
        .code(409)
        .send({ message: "ネイティブ選択ダイアログはすでに開いています" });
    }

    nativePickerActive = true;
    try {
      const result = await options.pickFiles();
      if (result.kind === "cancelled") {
        return reply.code(200).send({ cancelled: true, added: [] });
      }
      const htmlPaths = result.paths.filter(isHtmlPath);
      const addedEntries = await options.sessionStore.addEntries(htmlPaths);
      if (addedEntries.length > 0) {
        await options.publishSessionUpdate();
      }
      return reply.code(201).send({
        cancelled: false,
        added: addedEntries,
        session: options.sessionStore.getSession(),
      });
    } finally {
      nativePickerActive = false;
    }
  });

  app.post<{ Body: unknown }>(
    "/api/session/pick-directory",
    async (request, reply) => {
      if (!hasMatchingIdentity(request.headers, options.serverIdentity)) {
        return reply
          .code(409)
          .send({ message: "サーバー識別子が一致しません" });
      }
      const mode = getDirectoryImportMode(request.body);
      if (!mode) {
        return reply.code(400).send({ message: "追加範囲が不正です" });
      }
      if (!options.pickDirectory) {
        return reply
          .code(501)
          .send({ message: "フォルダー選択を利用できません" });
      }
      if (nativePickerActive) {
        return reply
          .code(409)
          .send({ message: "ネイティブ選択ダイアログはすでに開いています" });
      }

      nativePickerActive = true;
      try {
        const result = await options.pickDirectory();
        if (result.kind === "cancelled") {
          return reply.code(200).send({ cancelled: true, added: [] });
        }
        const htmlPaths = await enumerateHtmlFiles(result.path, mode);
        const addedEntries = await options.sessionStore.addEntries(htmlPaths);
        if (addedEntries.length > 0) {
          await options.publishSessionUpdate();
        }
        return reply.code(201).send({
          cancelled: false,
          added: addedEntries,
          session: options.sessionStore.getSession(),
        });
      } finally {
        nativePickerActive = false;
      }
    },
  );
}

function hasMatchingIdentity(
  headers: Record<string, unknown>,
  serverIdentity: { instanceId: string } | undefined,
): boolean {
  return (
    serverIdentity !== undefined &&
    headers["x-zatto-instance-id"] === serverIdentity.instanceId
  );
}

function getDirectoryImportMode(
  body: unknown,
): DirectoryImportMode | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const { mode } = body as DirectoryPickerBody;
  return mode === "direct" || mode === "recursive" ? mode : undefined;
}

function isHtmlPath(filePath: string): boolean {
  const extension = filePath.toLowerCase();
  return extension.endsWith(".html") || extension.endsWith(".htm");
}
