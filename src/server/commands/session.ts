import { resolve } from "node:path";
import type { RpcMethods } from "../../shared/rpc-contract.js";
import {
  createSessionExchange,
  parseSessionExchange,
} from "../../shared/session-exchange.js";
import type { CommandContext } from "./context.js";
import { CommandError, domainError } from "./errors.js";
/** Typed operation implementations, validated by the command dispatcher. */
export type CommandHandlers = {
  [M in keyof RpcMethods]: (
    params: RpcMethods[M]["params"],
  ) => Promise<RpcMethods[M]["result"]> | RpcMethods[M]["result"];
};
/**
 * Builds session mutation and exchange commands.
 * @param context - Store and shared mutation guards
 * @returns Session handlers
 * @throws Never during construction
 */
export function sessionCommands(context: CommandContext) {
  const store = context.sessionStore;
  return {
    "session.get": () => ({
      access: "local" as const,
      ...store.getSession(),
      ...store.getWorkspaceState(),
      serverIdentity: context.serverIdentity
        ? { instanceId: context.serverIdentity.instanceId }
        : undefined,
      filePicker:
        context.pickFiles && context.serverIdentity
          ? { available: true, instanceId: context.serverIdentity.instanceId }
          : { available: false },
      directoryPicker:
        context.pickDirectory && context.serverIdentity
          ? { available: true, instanceId: context.serverIdentity.instanceId }
          : { available: false },
    }),
    "session.add": async ({ paths, workspaceId }) => {
      const result = await store.addEntriesWithResults(
        paths.map((path) => resolve(path)),
        workspaceId,
      );
      if (result.added.length) await context.publish();
      return {
        ...result,
        activeWorkspaceId: store.getWorkspaceState().activeWorkspaceId,
        session: store.getSession(),
      };
    },
    "session.setFavorite": async ({ id, favorite, workspaceId }) => {
      const result = await store.setFavorite(id, favorite, workspaceId);
      if (result === "missing")
        throw domainError("notFound", "Entry not found.");
      if (result === "updated") await context.publish();
      return null;
    },
    "session.reorder": async ({ ids, workspaceId }) => {
      if (!(await store.reorderEntries(ids, workspaceId)))
        throw new CommandError(
          -32602,
          "`ids` には現在の全エントリを重複なく指定してください",
        );
      await context.publish();
      return null;
    },
    "session.removeMany": async ({ ids, workspaceId }) => {
      if (!(await store.removeEntries(ids, workspaceId)))
        throw domainError("notFound", "エントリが見つかりません");
      await context.publish();
      return null;
    },
    "session.remove": async ({ id, workspaceId }) => {
      if (!(await store.removeEntry(id, workspaceId)))
        throw domainError("notFound", "エントリが見つかりません");
      await context.publish();
      return null;
    },
    "session.clear": async ({ workspaceId }) => {
      await store.clear(context.existingWorkspace(workspaceId));
      await context.publish();
      return null;
    },
    "session.export": ({ workspaceId }) =>
      createSessionExchange(store.getWorkspace(workspaceId).entries),
    "session.import": async ({
      exchange,
      mode = "replace",
      instanceId,
      workspaceId,
    }) => {
      const target = workspaceId;
      context.identity(instanceId);
      const paths = parseSessionExchange(exchange).entries.map(
        (entry) => entry.path,
      );
      const session =
        mode === "merge"
          ? await store.mergeEntries(paths, target)
          : await store.replaceEntries(paths, target);
      await context.publish();
      return session;
    },
  } satisfies Pick<
    CommandHandlers,
    | "session.get"
    | "session.add"
    | "session.setFavorite"
    | "session.reorder"
    | "session.removeMany"
    | "session.remove"
    | "session.clear"
    | "session.export"
    | "session.import"
  >;
}
