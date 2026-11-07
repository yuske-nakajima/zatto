import { nanoid } from "nanoid";
import type {
  ActiveReview,
  ReviewAuthor,
  ReviewDelivery,
  ReviewEvent,
  ReviewLinkResult,
  ReviewStates,
  ReviewThread,
  TextAnchor,
  UnlinkedThread,
} from "../../shared/review.js";
import { reviewRequestText } from "../../shared/review.js";
import {
  anchorAtPassage,
  compactText,
  locatePassage,
} from "../../shared/review-match.js";
import { visibleText } from "../review-text.js";
import type { CommandContext } from "./context.js";
import { domainError } from "./errors.js";
import type { CommandHandlers } from "./session.js";

/** 編集が続く間は通知せず、書き終わってから外れたスレッドを判定する。 */
export const REVIEW_NOTICE_DELAY_MS = 3_000;

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
  /** エントリ ID → レビュー中のセッションへ文章を探せないと伝えたスレッド。 */
  const noticed = new Map<string, Set<string>>();
  const noticeTimers = new Map<string, NodeJS.Timeout>();

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

  /** ファイルの未解決のスレッドのうち、文章を探せないもの。読めないファイルでは判定しない。 */
  async function unlinkedThreads(entryId: string): Promise<UnlinkedThread[]> {
    const entry = context.sessionStore.getEntry(entryId);
    if (!entry) return [];
    let text: string;
    try {
      text = await visibleText(entry.absPath);
    } catch {
      return [];
    }
    return store
      .list(entryId)
      .flatMap((thread) =>
        thread.anchor &&
        !thread.resolved &&
        !thread.detached &&
        !locatePassage(text, thread.anchor)
          ? [{ threadId: thread.id, quote: thread.anchor.exact }]
          : [],
      );
  }
  /**
   * 新しく文章を探せなくなったスレッドをレビュー中のセッションへ伝える。
   * 付け直せない文章を繰り返さないよう、同じスレッドは付け直されるまで 1 回だけ伝える。
   */
  async function noticeUnlinked(review: ActiveReview): Promise<void> {
    const unlinked = (await unlinkedThreads(review.entryId)).map(
      (thread) => thread.threadId,
    );
    if (reviews.get(review.id) !== review) return;
    const known = noticed.get(review.entryId);
    noticed.set(review.entryId, new Set(unlinked));
    const threadIds = unlinked.filter((threadId) => !known?.has(threadId));
    if (!threadIds.length) return;
    enqueue(review.session, {
      kind: "unlinked",
      reviewId: review.id,
      entryId: review.entryId,
      workspaceId: review.workspaceId,
      threadIds,
    });
  }
  /** 通知の失敗でレビューの開始やファイルの更新を止めない。 */
  async function noticeUnlinkedSafely(review: ActiveReview): Promise<void> {
    try {
      await noticeUnlinked(review);
    } catch (error) {
      context.logError(error, "Could not check review threads.");
    }
  }
  function forgetNotices(entryId: string): void {
    noticed.delete(entryId);
    clearTimeout(noticeTimers.get(entryId));
    noticeTimers.delete(entryId);
  }
  context.subscribeFileChanges?.((entryId) => {
    if (!reviewOf(entryId)) return;
    clearTimeout(noticeTimers.get(entryId));
    const timer = setTimeout(() => {
      noticeTimers.delete(entryId);
      const review = reviewOf(entryId);
      if (review) void noticeUnlinkedSafely(review);
    }, REVIEW_NOTICE_DELAY_MS);
    timer.unref();
    noticeTimers.set(entryId, timer);
  });

  /** quote の移動先を読む。ファイルの中で 1 か所に決まらない文章は受け付けない。 */
  async function anchorForQuote(
    entryId: string,
    quote: string,
  ): Promise<TextAnchor> {
    const entry = context.sessionStore.getEntry(entryId);
    let text: string;
    try {
      if (!entry) throw new Error("Entry not found.");
      text = await visibleText(entry.absPath);
    } catch {
      throw domainError(
        "conflict",
        "The file cannot be read, so the quoted text cannot be checked.",
      );
    }
    const anchor = anchorAtPassage(text, quote);
    if (anchor) return anchor;
    throw domainError(
      "conflict",
      text.includes(compactText(quote))
        ? "The quoted text appears more than once in the file. Quote a longer passage."
        : "The quoted text does not appear in the file. Quote text copied from the edited document.",
    );
  }
  /** LLM が指定した文章に、1 回だけ現れるときは前後の文脈を付ける。 */
  async function withContext(
    entryId: string,
    anchor: TextAnchor | null,
  ): Promise<TextAnchor | null> {
    if (!anchor || anchor.prefix || anchor.suffix) return anchor;
    const entry = context.sessionStore.getEntry(entryId);
    if (!entry) return anchor;
    try {
      return (
        anchorAtPassage(await visibleText(entry.absPath), anchor.exact) ??
        anchor
      );
    } catch {
      return anchor;
    }
  }

  return {
    "review.get": ({ threadId }) => {
      const thread = store.get(threadId);
      if (!thread) throw domainError("notFound", "Thread not found.");
      const entry = context.sessionStore.findEntry(thread.entryId);
      if (!entry) throw domainError("notFound", "Entry not found.");
      return {
        thread,
        file: { id: entry.id, title: entry.title, path: entry.absPath },
      };
    },
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
        await withContext(entryId, anchor),
        author,
        body,
        attachments,
      );
      notifyComment(thread, author);
      threadUpdated(entryId);
      return thread;
    },
    "review.reply": async ({ threadId, author, body, attachments, quote }) => {
      const current = store.get(threadId);
      if (!current) throw domainError("notFound", "Thread not found.");
      const anchor =
        quote === undefined
          ? undefined
          : await anchorForQuote(current.entryId, quote);
      const thread = await store.reply(
        threadId,
        author,
        body,
        attachments,
        anchor,
      );
      if (anchor) noticed.get(thread.entryId)?.delete(threadId);
      notifyComment(thread, author);
      threadUpdated(thread.entryId);
      return author.kind === "llm"
        ? { ...thread, unlinked: await unlinkedThreads(thread.entryId) }
        : thread;
    },
    "review.relink": async ({ links }) => {
      const results: ReviewLinkResult[] = [];
      const entryIds = new Set<string>();
      for (const link of links) {
        const { threadId } = link;
        try {
          const thread = store.get(threadId);
          if (!thread) throw domainError("notFound", "Thread not found.");
          if ("detach" in link) {
            if (!thread.anchor)
              throw domainError(
                "conflict",
                "The thread is on the whole document, so it has no text to detach from.",
              );
            await store.detach(threadId);
          } else
            await store.relink(
              threadId,
              await anchorForQuote(thread.entryId, link.quote),
            );
          noticed.get(thread.entryId)?.delete(threadId);
          entryIds.add(thread.entryId);
          results.push({ threadId, ok: true });
        } catch (error) {
          results.push({
            threadId,
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const unlinked: UnlinkedThread[] = [];
      for (const entryId of entryIds) {
        threadUpdated(entryId);
        unlinked.push(...(await unlinkedThreads(entryId)));
      }
      return { results, unlinked };
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
      return {
        text: reviewRequestText(context.cliCommand, entry.absPath, workspaceId),
      };
    },
    "review.start": async ({ workspaceId, entryId, session, client }) => {
      requireEntry(workspaceId, entryId);
      const current = reviewOf(entryId);
      if (current?.session === session) {
        // 同じ会話からのつなぎ直しで、先に始めた待機がクライアントを伝えていなかったときに補う
        if (client && current.client !== client) {
          current.client = client;
          statesChanged();
        }
        sendPending(current);
        await noticeUnlinkedSafely(current);
        return current;
      }
      if (current) {
        reviews.delete(current.id);
        forgetDeliveries(entryId);
        forgetNotices(entryId);
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
      await noticeUnlinkedSafely(review);
      statesChanged();
      return review;
    },
    "review.finish": ({ reviewId }) => {
      const review = reviews.get(reviewId);
      if (!review) throw domainError("notFound", "Review not found.");
      reviews.delete(reviewId);
      forgetDeliveries(review.entryId);
      forgetNotices(review.entryId);
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
    | "review.get"
    | "review.list"
    | "review.create"
    | "review.reply"
    | "review.relink"
    | "review.resolve"
    | "review.request"
    | "review.start"
    | "review.finish"
    | "review.states"
    | "review.take"
  >;
}
