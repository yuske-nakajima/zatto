import { chmod, readFile, realpath, stat } from "node:fs/promises";
import { writeFileAtomically } from "../../shared/atomic-file.js";
import { markdownRevision, setMarkdownTask } from "../markdown-tasks.js";
import { viewableKind } from "../viewable-file.js";
import type { CommandContext } from "./context.js";
import { CommandError, domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";
/**
 * Creates the task checkbox command, the only operation that writes to registered files.
 * @param context - Store used to resolve entries
 * @returns Markdown handlers
 * @throws Never during construction
 */
export function markdownCommands(context: CommandContext) {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    "markdown.setTask": ({ workspaceId, id, index, checked, revision }) => {
      const entry = context.sessionStore
        .getWorkspace(workspaceId)
        .entries.find((item) => item.id === id);
      if (!entry) throw domainError("notFound", "Entry not found.");
      if (viewableKind(entry.absPath) !== "markdown")
        throw new CommandError(-32602, "The entry is not a Markdown file.");
      const next = pending.then(async () => {
        // シンボリックリンクを置き換えないよう、実体のパスへ書き込む
        const target = await realpath(entry.absPath);
        const source = await readFile(target, "utf8");
        const updated =
          markdownRevision(source) === revision
            ? setMarkdownTask(source, index, checked)
            : null;
        if (updated === null)
          throw domainError(
            "conflict",
            "The file changed after it was displayed.",
          );
        if (updated !== source) {
          const { mode } = await stat(target);
          await writeFileAtomically(target, updated);
          await chmod(target, mode);
        }
        return { revision: markdownRevision(updated) };
      });
      pending = next.catch(() => undefined);
      return next;
    },
  } satisfies Pick<CommandHandlers, "markdown.setTask">;
}
