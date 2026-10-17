import type { FastifyInstance } from "fastify";
import type { SessionStore } from "./session.js";
import { WorkspaceError, workspaceName } from "./workspace-state.js";

/**
 * Registers workspace management and stale-client mutation protection.
 * @param app - HTTP application
 * @param store - Durable workspace authority
 * @param publish - Publishes the committed active collection and workspace metadata
 * @returns Nothing
 * @throws When route registration fails
 */
export function registerWorkspaceRoutes(
  app: FastifyInstance,
  store: SessionStore,
  publish: () => Promise<void>,
): void {
  app.addHook("preHandler", async (request, reply) => {
    const expected = request.headers["x-zatto-workspace-id"];
    if (
      expected !== undefined &&
      expected !== store.getWorkspaceState().activeWorkspaceId
    ) {
      return reply.code(409).send({
        message: "Workspace changed. Retry from the active workspace.",
      });
    }
  });
  app.get("/api/workspaces", async () => store.getWorkspaceState());
  app.post<{ Body: { name?: unknown } }>(
    "/api/workspaces",
    async (request, reply) => {
      const workspace = await store.createWorkspace(
        workspaceName(request.body?.name),
      );
      await publish();
      return reply.code(201).send(workspace);
    },
  );
  app.put<{ Params: { id: string } }>(
    "/api/workspaces/:id/activate",
    async (request) => {
      await store.switchWorkspace(request.params.id);
      await publish();
      return { ...store.getSession(), ...store.getWorkspaceState() };
    },
  );
  app.patch<{ Params: { id: string }; Body: { name?: unknown } }>(
    "/api/workspaces/:id",
    async (request) => {
      await store.renameWorkspace(
        request.params.id,
        workspaceName(request.body?.name),
      );
      await publish();
      return store.getWorkspaceState();
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/workspaces/:id",
    async (request) => {
      await store.deleteWorkspace(request.params.id);
      await publish();
      return { ...store.getSession(), ...store.getWorkspaceState() };
    },
  );
  app.addHook("onError", async (_request, _reply, error) => {
    if (error instanceof WorkspaceError) app.log.info(error.message);
  });
}
