import type { CommandContext } from "./context.js";
import type { CommandHandlers } from "./session.js";
/**
 * Creates named-workspace commands.
 * @param context - Store and shared publication
 * @returns Workspace management handlers
 * @throws Never during construction
 */
export function workspaceCommands(context: CommandContext) {
  const store = context.sessionStore;
  return {
    "workspaces.list": () => store.getWorkspaceState(),
    "workspaces.create": async ({ name }) => {
      const workspace = await store.createWorkspace(name);
      await context.publish();
      return workspace;
    },
    "workspaces.activate": async ({ id }) => {
      await store.switchWorkspace(id);
      await context.publish();
      return { ...store.getSession(), ...store.getWorkspaceState() };
    },
    "workspaces.rename": async ({ id, name }) => {
      await store.renameWorkspace(id, name);
      await context.publish();
      return store.getWorkspaceState();
    },
    "workspaces.delete": async ({ id }) => {
      await store.deleteWorkspace(id);
      await context.publish();
      return { ...store.getSession(), ...store.getWorkspaceState() };
    },
  } satisfies Pick<
    CommandHandlers,
    | "workspaces.list"
    | "workspaces.create"
    | "workspaces.activate"
    | "workspaces.rename"
    | "workspaces.delete"
  >;
}
