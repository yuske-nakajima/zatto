import { enumerateHtmlFiles } from "../directory-import.js";
import type { CommandContext } from "./context.js";
import { domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";
/**
 * Creates native picker commands with a shared dialog lock.
 * @param context - Picker capabilities, guards, and store
 * @returns File and directory picker handlers
 * @throws Never during construction
 */
export function pickerCommands(context: CommandContext) {
  let active = false;
  async function pick(
    workspaceId: string,
    select: () => Promise<string[] | null>,
  ) {
    if (active)
      throw domainError("busy", "ネイティブ選択ダイアログはすでに開いています");
    active = true;
    try {
      const paths = await select();
      if (paths === null) return { cancelled: true, added: [] };
      const added = await context.sessionStore.addEntries(paths, workspaceId);
      if (added.length) await context.publish();
      return {
        cancelled: false,
        added,
        session: context.sessionStore.getSession(),
      };
    } finally {
      active = false;
    }
  }
  return {
    "session.pickFiles": async ({ instanceId, workspaceId }) => {
      const target = context.workspace(workspaceId);
      context.identity(instanceId, true);
      const picker = context.pickFiles;
      if (!picker)
        throw domainError("pickerUnavailable", "ファイル選択を利用できません");
      return pick(target, async () => {
        const result = await picker();
        return result.kind === "cancelled"
          ? null
          : result.paths.filter((path) => /\.html?$/i.test(path));
      });
    },
    "session.pickDirectory": async ({ instanceId, workspaceId, mode }) => {
      const target = context.workspace(workspaceId);
      context.identity(instanceId, true);
      const picker = context.pickDirectory;
      if (!picker)
        throw domainError(
          "pickerUnavailable",
          "フォルダー選択を利用できません",
        );
      return pick(target, async () => {
        const result = await picker();
        return result.kind === "cancelled"
          ? null
          : enumerateHtmlFiles(result.path, mode);
      });
    },
  } satisfies Pick<
    CommandHandlers,
    "session.pickFiles" | "session.pickDirectory"
  >;
}
