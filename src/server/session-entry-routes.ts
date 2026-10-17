import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import type { SessionStore } from "./session.js";

interface AddSessionBody {
  paths?: string[];
}
interface ReorderSessionBody {
  ids?: string[];
}
interface RemoveSessionEntriesBody {
  ids?: unknown;
}
/**
 * Registers active-workspace entry mutations.
 * @param app - HTTP application
 * @param store - Durable session authority
 * @param publishSessionUpdate - Broadcasts committed changes
 * @returns Nothing
 * @throws When route registration fails
 */
export function registerSessionEntryRoutes(
  app: FastifyInstance,
  store: SessionStore,
  publishSessionUpdate: () => Promise<void>,
): void {
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

      const addedEntries = await store.addEntries(
        normalizedPaths,
        request.headers["x-zatto-workspace-id"] as string | undefined,
      );
      if (addedEntries.length > 0) {
        await publishSessionUpdate();
      }
      return reply.code(201).send({
        added: addedEntries,
        session: store.getSession(),
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

      const reordered = await store.reorderEntries(
        ids,
        request.headers["x-zatto-workspace-id"] as string | undefined,
      );
      if (!reordered) {
        return reply.code(400).send({
          message: "`ids` には現在の全エントリを重複なく指定してください",
        });
      }

      await publishSessionUpdate();
      return reply.code(204).send();
    },
  );

  app.delete<{ Body: unknown }>(
    "/api/session/entries",
    async (request, reply) => {
      const ids = getRemoveSessionEntryIds(request.body);
      if (!ids) {
        return reply.code(400).send({
          message: "`ids` には重複のないエントリIDを1件以上指定してください",
        });
      }

      const removed = await store.removeEntries(
        ids,
        request.headers["x-zatto-workspace-id"] as string | undefined,
      );
      if (!removed) {
        return reply.code(404).send({ message: "エントリが見つかりません" });
      }
      await publishSessionUpdate();
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/session/:id",
    async (request, reply) => {
      const removed = await store.removeEntry(
        request.params.id,
        request.headers["x-zatto-workspace-id"] as string | undefined,
      );
      if (!removed) {
        return reply.code(404).send({ message: "エントリが見つかりません" });
      }
      await publishSessionUpdate();
      return reply.code(204).send();
    },
  );

  app.delete("/api/session", async (request, reply) => {
    await store.clear(
      request.headers["x-zatto-workspace-id"] as string | undefined,
    );
    await publishSessionUpdate();
    return reply.code(204).send();
  });
}

function getRemoveSessionEntryIds(body: unknown): string[] | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const { ids } = body as RemoveSessionEntriesBody;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(ids).size !== ids.length
  ) {
    return undefined;
  }
  return ids;
}
