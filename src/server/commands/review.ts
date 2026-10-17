import { nanoid } from "nanoid";
import {
  type ActiveReview,
  REVIEW_LIMITS,
  type ReviewAuthor,
  type ReviewEvent,
  type ReviewListener,
  type ReviewThread,
} from "../../shared/review.js";
import type { CommandContext } from "./context.js";
import { domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";
/**
 * Creates review thread commands and the in-memory review coordination.
 * Active reviews, waiting sessions, and undelivered events belong to running commands, so they are not persisted.
 * @param context - Stores, notifications, and guards
 * @returns Review handlers
 * @throws Never during construction
 */
export function reviewCommands(context: CommandContext) {
  const store = context.reviewStore;
  const reviews = new Map<string, ActiveReview>();
  const listeners = new Map<string, ReviewListener>();
  const queues = new Map<string, ReviewEvent[]>();

  function requireEntry(workspaceId: string, entryId: string): void {
    const exists = context.sessionStore
      .getWorkspace(workspaceId)
      .entries.some((entry) => entry.id === entryId);
    if (!exists) throw domainError("notFound", "Entry not found.");
  }
  function threadUpdated(entryId: string): void {
    context.realtimeHub.broadcast({ type: "review:update", entryId });
  }
  function states() {
    const since = Date.now() - REVIEW_LIMITS.listenerTtlMs;
    return {
      reviews: [...reviews.values()],
      listeners: [...listeners.values()].filter(
        (listener) => listener.lastSeenAt >= since,
      ),
    };
  }
  function statesChanged(): void {
    context.realtimeHub.broadcast({ type: "review:states", ...states() });
  }
  function enqueue(session: string, event: ReviewEvent): void {
    queues.set(session, [...(queues.get(session) ?? []), event]);
    context.realtimeHub.broadcast({ type: "review:event", session });
  }
  function reviewOf(entryId: string): ActiveReview | undefined {
    return [...reviews.values()].find((review) => review.entryId === entryId);
  }
  /** Forwards comments the user writes on a file under review to the reviewing session. */
  function notifyComment(thread: ReviewThread, author: ReviewAuthor): void {
    const review = reviewOf(thread.entryId);
    if (author.kind !== "user" || !review) return;
    enqueue(review.session, {
      kind: "comment",
      reviewId: review.id,
      entryId: review.entryId,
      workspaceId: review.workspaceId,
      threadId: thread.id,
    });
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
      notifyComment(thread, author);
      return thread;
    },
    "review.reply": async ({ threadId, author, body }) => {
      const thread = await store.reply(threadId, author, body);
      threadUpdated(thread.entryId);
      notifyComment(thread, author);
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
    "review.start": ({ workspaceId, entryId, session }) => {
      requireEntry(workspaceId, entryId);
      const current = reviewOf(entryId);
      if (current?.session === session) return current;
      if (current) reviews.delete(current.id);
      const review: ActiveReview = {
        id: nanoid(),
        entryId,
        workspaceId,
        session,
        createdAt: Date.now(),
      };
      reviews.set(review.id, review);
      statesChanged();
      return review;
    },
    "review.finish": ({ reviewId }) => {
      const review = reviews.get(reviewId);
      if (!review) throw domainError("notFound", "Review not found.");
      reviews.delete(reviewId);
      enqueue(review.session, {
        kind: "finished",
        reviewId,
        entryId: review.entryId,
        workspaceId: review.workspaceId,
      });
      statesChanged();
      return null;
    },
    "review.states": () => states(),
    "review.listen": ({ session }) => {
      const listener = { session, lastSeenAt: Date.now() };
      listeners.set(session, listener);
      statesChanged();
      return listener;
    },
    "review.unlisten": ({ session }) => {
      if (listeners.delete(session)) statesChanged();
      return null;
    },
    "review.take": ({ session }) => {
      const events = queues.get(session) ?? [];
      queues.delete(session);
      return { events };
    },
  } satisfies Pick<
    CommandHandlers,
    | "review.list"
    | "review.create"
    | "review.reply"
    | "review.edit"
    | "review.delete"
    | "review.resolve"
    | "review.start"
    | "review.finish"
    | "review.states"
    | "review.listen"
    | "review.unlisten"
    | "review.take"
  >;
}
