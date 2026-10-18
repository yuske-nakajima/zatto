import { nanoid } from "nanoid";
import type {
  ActiveReview,
  ReviewAuthor,
  ReviewDelivery,
  ReviewEvent,
  ReviewStates,
  ReviewThread,
  TextAnchor,
} from "../../shared/review.js";
import { reviewRequestText } from "../../shared/review.js";
import { countPassage, visibleText } from "../review-text.js";
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
      latestReplies: store.latestReplies(),
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
  /**
   * Sends threads the user left unanswered while no session was reviewing the file.
   * Threads with a delivery are already queued or taken, so reconnecting does not send them twice.
   */
  function sendPending(review: ActiveReview): void {
    let sent = false;
    for (const thread of store.list(review.entryId)) {
      if (
        thread.resolved ||
        thread.comments.at(-1)?.author.kind !== "user" ||
        deliveries.has(thread.id)
      )
        continue;
      deliveries.set(thread.id, {
        entryId: thread.entryId,
        status: "undelivered",
        since: Date.now(),
      });
      enqueue(review.session, {
        kind: "comment",
        reviewId: review.id,
        entryId: review.entryId,
        workspaceId: review.workspaceId,
        threadId: thread.id,
      });
      sent = true;
    }
    if (sent) statesChanged();
  }
  /** Forwards comments the user writes on a file under review to the reviewing session. */
  function notifyComment(thread: ReviewThread, author: ReviewAuthor): void {
    const review = reviewOf(thread.entryId);
    if (author.kind !== "user") deliveries.delete(thread.id);
    if (author.kind !== "user" || !review) return;
    deliveries.set(thread.id, {
      entryId: thread.entryId,
      status: "undelivered",
      since: Date.now(),
    });
    enqueue(review.session, {
      kind: "comment",
      reviewId: review.id,
      entryId: review.entryId,
      workspaceId: review.workspaceId,
      threadId: thread.id,
    });
  }

  /**
   * Moves a thread to quoted text, or refuses an LLM reply whose commented text left the file,
   * so a thread does not silently lose its place after the document is edited.
   */
  async function replyAnchor(
    threadId: string,
    author: ReviewAuthor,
    quote: string | undefined,
  ): Promise<TextAnchor | undefined> {
    const thread = store.get(threadId);
    if (!thread) throw domainError("notFound", "Thread not found.");
    if (quote === undefined && (author.kind !== "llm" || !thread.anchor))
      return undefined;
    const entry = context.sessionStore.getEntry(thread.entryId);
    let text: string;
    try {
      if (!entry) throw new Error("Entry not found.");
      text = await visibleText(entry.absPath);
    } catch {
      // ファイルを読めないときは照合できないため、付け直しの指定だけを反映する
      return quote === undefined
        ? undefined
        : { exact: quote, prefix: "", suffix: "" };
    }
    if (quote !== undefined) {
      const count = countPassage(text, quote);
      if (count === 0)
        throw domainError(
          "conflict",
          "The quoted text does not appear in the file. Quote text copied from the edited document.",
        );
      if (count > 1)
        throw domainError(
          "conflict",
          "The quoted text appears more than once in the file. Quote a longer passage.",
        );
      return { exact: quote, prefix: "", suffix: "" };
    }
    if (thread.anchor && countPassage(text, thread.anchor.exact) === 0)
      throw domainError(
        "conflict",
        "The commented text no longer appears in the file. If you edited it, reply again with the edited passage as --quote (quote in reply_review_thread).",
      );
    return undefined;
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
    "review.reply": async ({ threadId, author, body, attachments, quote }) => {
      const anchor = await replyAnchor(threadId, author, quote);
      const thread = await store.reply(
        threadId,
        author,
        body,
        attachments,
        anchor,
      );
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
    "review.request": ({ workspaceId, entryId }) => {
      const entry = context.sessionStore
        .getWorkspace(workspaceId)
        .entries.find((item) => item.id === entryId);
      if (!entry) throw domainError("notFound", "Entry not found.");
      return { text: reviewRequestText(context.cliCommand, entry.absPath) };
    },
    "review.start": ({ workspaceId, entryId, session, client }) => {
      requireEntry(workspaceId, entryId);
      const current = reviewOf(entryId);
      if (current?.session === session) {
        // 同じ会話からのつなぎ直しで、先に始めた待機がクライアントを伝えていなかったときに補う
        if (client && current.client !== client) {
          current.client = client;
          statesChanged();
        }
        sendPending(current);
        return current;
      }
      if (current) {
        reviews.delete(current.id);
        forgetDeliveries(entryId);
      }
      const review: ActiveReview = {
        id: nanoid(),
        entryId,
        workspaceId,
        session,
        ...(client ? { client } : {}),
        createdAt: Date.now(),
      };
      reviews.set(review.id, review);
      sendPending(review);
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
        deliveries.set(threadId, {
          ...(deliveries.get(threadId) as ReviewDelivery),
          status: "delivered",
          since: Date.now(),
        });
      if (taken.length) statesChanged();
      return { events };
    },
  } satisfies Pick<
    CommandHandlers,
    | "review.list"
    | "review.create"
    | "review.reply"
    | "review.resolve"
    | "review.request"
    | "review.start"
    | "review.finish"
    | "review.states"
    | "review.take"
  >;
}
