import { nanoid } from "nanoid";
import type { ReviewRequest } from "../../shared/review.js";
import type { CommandContext } from "./context.js";
import { domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";
/**
 * Creates review thread and review request commands.
 * Requests belong to the command waiting on them, so they live only in memory.
 * @param context - Stores, notifications, and guards
 * @returns Review handlers
 * @throws Never during construction
 */
export function reviewCommands(context: CommandContext) {
  const store = context.reviewStore;
  const requests = new Map<string, ReviewRequest>();

  function requireEntry(workspaceId: string, entryId: string): void {
    const exists = context.sessionStore
      .getWorkspace(workspaceId)
      .entries.some((entry) => entry.id === entryId);
    if (!exists) throw domainError("notFound", "Entry not found.");
  }
  function threadUpdated(entryId: string): void {
    context.realtimeHub.broadcast({ type: "review:update", entryId });
  }
  function requestsChanged(): void {
    context.realtimeHub.broadcast({
      type: "review:requests",
      requests: [...requests.values()],
    });
  }
  function takeRequest(requestId: string): ReviewRequest {
    const request = requests.get(requestId);
    if (!request) throw domainError("notFound", "Review request not found.");
    requests.delete(requestId);
    return request;
  }

  return {
    "review.list": ({ workspaceId, entryId }) => {
      requireEntry(workspaceId, entryId);
      return { threads: store.list(entryId) };
    },
    "review.create": async ({ workspaceId, entryId, anchor, author, body }) => {
      requireEntry(workspaceId, entryId);
      const thread = await store.create(entryId, anchor, author, body);
      threadUpdated(entryId);
      return thread;
    },
    "review.reply": async ({ threadId, author, body }) => {
      const thread = await store.reply(threadId, author, body);
      threadUpdated(thread.entryId);
      return thread;
    },
    "review.edit": async ({ threadId, commentId, body }) => {
      const thread = await store.editComment(threadId, commentId, body);
      threadUpdated(thread.entryId);
      return thread;
    },
    "review.delete": async ({ threadId, commentId }) => {
      const entryId = store.get(threadId)?.entryId;
      const thread = await store.deleteComment(threadId, commentId);
      if (entryId) threadUpdated(entryId);
      return thread;
    },
    "review.resolve": async ({ threadId, resolved }) => {
      const thread = await store.setResolved(threadId, resolved);
      threadUpdated(thread.entryId);
      return thread;
    },
    "review.request": ({ workspaceId, entryId, session }) => {
      requireEntry(workspaceId, entryId);
      const request: ReviewRequest = {
        id: nanoid(),
        entryId,
        workspaceId,
        ...(session ? { session } : {}),
        createdAt: Date.now(),
      };
      requests.set(request.id, request);
      requestsChanged();
      return request;
    },
    "review.requests": () => ({ requests: [...requests.values()] }),
    "review.complete": ({ requestId }) => {
      takeRequest(requestId);
      context.realtimeHub.broadcast({ type: "review:completed", requestId });
      requestsChanged();
      return null;
    },
    "review.cancel": ({ requestId }) => {
      takeRequest(requestId);
      requestsChanged();
      return null;
    },
  } satisfies Pick<
    CommandHandlers,
    | "review.list"
    | "review.create"
    | "review.reply"
    | "review.edit"
    | "review.delete"
    | "review.resolve"
    | "review.request"
    | "review.requests"
    | "review.complete"
    | "review.cancel"
  >;
}
