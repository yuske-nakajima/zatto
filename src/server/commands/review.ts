import { nanoid } from "nanoid";
import type {
  ActiveReview,
  ReviewAuthor,
  ReviewDelivery,
  ReviewEvent,
  ReviewStates,
  ReviewThread,
} from "../../shared/review.js";
import type { CommandContext } from "./context.js";
import { domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";
/**
 * Creates review thread commands and the in-memory review coordination.
 * Active reviews and undelivered events belong to running commands, so they are not persisted.
 * @param context - Stores, notifications, and guards
 * @returns Review handlers
 * @throws Never during construction
 */
export function reviewCommands(context: CommandContext) {
  const store = context.reviewStore;
  const reviews = new Map<string, ActiveReview>();
  const queues = new Map<string, ReviewEvent[]>();
  /** Thread ID → whether the reviewing session took the user's latest comment. */
  const deliveries = new Map<string, ReviewDelivery>();

  function requireEntry(workspaceId: string, entryId: string): void {
    const exists = context.sessionStore
      .getWorkspace(workspaceId)
      .entries.some((entry) => entry.id === entryId);
    if (!exists) throw domainError("notFound", "Entry not found.");
  }
  function states(): ReviewStates {
    return {
      reviews: [...reviews.values()],
      openThreadCounts: store.openCounts(),
      resolvedThreadCounts: store.resolvedCounts(),
      deliveries: Object.fromEntries(deliveries),
    };
  }
  function forgetDeliveries(entryId: string): void {
    for (const thread of store.list(entryId)) deliveries.delete(thread.id);
  }
  function threadUpdated(entryId: string): void {
    context.realtimeHub.broadcast({ type: "review:update", entryId });
    statesChanged();
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
    if (author.kind !== "user") deliveries.delete(thread.id);
    if (author.kind !== "user" || !review) return;
    deliveries.set(thread.id, { status: "undelivered", since: Date.now() });
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
    "review.create": async ({
      workspaceId,
      entryId,
      anchor,
      author,
      body,
      attachments,
    }) => {
      requireEntry(workspaceId, entryId);
      const thread = await store.create(
        entryId,
        anchor,
        author,
        body,
        attachments,
      );
      notifyComment(thread, author);
      threadUpdated(entryId);
      return thread;
    },
    "review.reply": async ({ threadId, author, body, attachments }) => {
      const thread = await store.reply(threadId, author, body, attachments);
      notifyComment(thread, author);
      threadUpdated(thread.entryId);
      return thread;
    },
    "review.resolve": async ({ threadId, resolved }) => {
      const thread = await store.setResolved(threadId, resolved);
      if (resolved) deliveries.delete(threadId);
      threadUpdated(thread.entryId);
      return thread;
    },
    "review.start": ({ workspaceId, entryId, session }) => {
      requireEntry(workspaceId, entryId);
      const current = reviewOf(entryId);
      if (current?.session === session) return current;
      if (current) {
        reviews.delete(current.id);
        forgetDeliveries(entryId);
      }
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
      forgetDeliveries(review.entryId);
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
    "review.take": ({ session, entryId }) => {
      const queued = queues.get(session) ?? [];
      const events = queued.filter(
        (event) => entryId === undefined || event.entryId === entryId,
      );
      const rest = queued.filter((event) => !events.includes(event));
      if (rest.length) queues.set(session, rest);
      else queues.delete(session);
      const taken = events.flatMap((event) =>
        event.kind === "comment" && deliveries.has(event.threadId)
          ? [event.threadId]
          : [],
      );
      for (const threadId of taken)
        deliveries.set(threadId, { status: "delivered", since: Date.now() });
      if (taken.length) statesChanged();
      return { events };
    },
  } satisfies Pick<
    CommandHandlers,
    | "review.list"
    | "review.create"
    | "review.reply"
    | "review.resolve"
    | "review.start"
    | "review.finish"
    | "review.states"
    | "review.take"
  >;
}
