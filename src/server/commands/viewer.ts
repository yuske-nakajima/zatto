import type { CommandContext } from "./context.js";
import { domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";
/**
 * Web UI のタブへ表示を頼むコマンドを作る。
 * タブは選択中のワークスペースだけを表示するため、ほかのワークスペースのエントリは表示を頼まない。
 * @param context - エントリの照合と通知に使う
 * @returns viewer のハンドラー
 * @throws 作成時には投げない
 */
export function viewerCommands(context: CommandContext) {
  return {
    "viewer.show": ({ workspaceId, entryId }) => {
      const exists = context.sessionStore
        .getWorkspace(workspaceId)
        .entries.some((entry) => entry.id === entryId);
      if (!exists) throw domainError("notFound", "Entry not found.");
      if (
        context.sessionStore.getWorkspaceState().activeWorkspaceId !==
          workspaceId ||
        context.realtimeHub.viewerCount() === 0
      )
        return { shown: false };
      context.realtimeHub.broadcast({
        type: "viewer:show",
        workspaceId,
        entryId,
      });
      return { shown: true };
    },
  } satisfies Pick<CommandHandlers, "viewer.show">;
}
