import { SEARCH_LIMITS, searchEntries } from "../search.js";
import { SearchFileFailure } from "../search-file.js";
import type { CommandContext } from "./context.js";
import { CommandError, domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";
/**
 * Creates agent context and bounded file-search commands.
 * @param context - Read authority and browser context
 * @returns Query and context-update handlers
 * @throws Never during construction
 */
export function queryCommands(context: CommandContext) {
  return {
    "agentContext.get": () =>
      context.agentContextStore.getContext(context.sessionStore),
    "agentContext.set": ({ activeEntryId, view, workspaceId }) => {
      context.activeWorkspace(workspaceId);
      if (
        activeEntryId !== null &&
        !context.sessionStore.getEntry(activeEntryId)
      )
        throw new CommandError(
          -32602,
          "Agentコンテキストには有効なactiveEntryIdとviewが必要です",
        );
      context.agentContextStore.setBrowserContext({ activeEntryId, view });
      return null;
    },
    "search.query": async ({ query }) => {
      if (query.length > SEARCH_LIMITS.queryLength)
        throw domainError("searchLimit", "The search text is too long.", {
          code: "SEARCH_QUERY_TOO_LONG",
          maxLength: SEARCH_LIMITS.queryLength,
        });
      try {
        return await searchEntries(
          context.sessionStore.getSession().entries,
          query,
        );
      } catch (error) {
        if (error instanceof SearchFileFailure) {
          const data = {
            code: error.code,
            entryId: error.entryId,
            ...(error.code === "SEARCH_FILE_TOO_LARGE"
              ? { maxBytes: SEARCH_LIMITS.fileBytes }
              : {}),
          };
          if (error.code === "SEARCH_FILE_TOO_LARGE")
            throw domainError("searchLimit", error.message, data);
          throw new CommandError(-32603, error.message, data);
        }
        throw error;
      }
    },
  } satisfies Pick<
    CommandHandlers,
    "agentContext.get" | "agentContext.set" | "search.query"
  >;
}
