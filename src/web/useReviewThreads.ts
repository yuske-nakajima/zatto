import { useCallback, useEffect, useEffectEvent, useState } from "react";
import type { ServerMessage } from "../shared/protocol.js";
import type {
  ActiveReview,
  ReviewListener,
  ReviewThread,
  TextAnchor,
} from "../shared/review.js";
import { rpcCall } from "../shared/rpc-client.js";
import { subscribeServerMessages } from "./server-messages.js";

const USER = { kind: "user" } as const;

export interface ReviewThreads {
  threads: ReviewThread[];
  /** The review of the selected entry, if the user is reviewing it with an LLM session. */
  activeReview: ActiveReview | null;
  /** Entries under review in any workspace, for labelling the file list. */
  reviewingEntryIds: ReadonlySet<string>;
  /** LLM sessions waiting to receive a review. */
  listeners: ReviewListener[];
  startReview: (session: string) => Promise<boolean>;
  create: (anchor: TextAnchor | null, body: string) => Promise<boolean>;
  reply: (threadId: string, body: string) => Promise<boolean>;
  edit: (threadId: string, commentId: string, body: string) => Promise<boolean>;
  remove: (threadId: string, commentId: string) => Promise<boolean>;
  resolve: (threadId: string, resolved: boolean) => Promise<boolean>;
  finishReview: (reviewId: string) => Promise<boolean>;
}

/**
 * Loads the review threads of the selected entry and the review states, following server updates.
 * @param workspaceId - Displayed workspace
 * @param entryId - Selected entry
 * @param reportError - Visible error reporter
 * @returns Threads, review states, and operations
 */
export function useReviewThreads(
  workspaceId: string | null,
  entryId: string | null,
  reportError: (message: string) => void,
): ReviewThreads {
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [reviews, setReviews] = useState<ActiveReview[]>([]);
  const [listeners, setListeners] = useState<ReviewListener[]>([]);

  const refresh = useCallback(async () => {
    if (!workspaceId || !entryId) {
      setThreads([]);
      return;
    }
    try {
      const result = await rpcCall("review.list", { workspaceId, entryId });
      setThreads(result.threads);
    } catch {
      setThreads([]);
    }
  }, [workspaceId, entryId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleMessage = useEffectEvent((message: ServerMessage) => {
    if (
      message.type === "review:update" &&
      (message.entryId === entryId || message.entryId === "")
    )
      void refresh();
    if (message.type === "review:states") {
      setReviews(message.reviews);
      setListeners(message.listeners);
    }
  });

  useEffect(
    () => subscribeServerMessages((message) => handleMessage(message)),
    [],
  );

  const isSessionLoaded = workspaceId !== null;
  useEffect(() => {
    if (!isSessionLoaded) return;
    void rpcCall("review.states", {})
      .then((result) => {
        setReviews(result.reviews);
        setListeners(result.listeners);
      })
      .catch(() => undefined);
  }, [isSessionLoaded]);

  async function run(
    operation: () => Promise<unknown>,
    failure: string,
  ): Promise<boolean> {
    try {
      await operation();
      await refresh();
      return true;
    } catch {
      reportError(failure);
      return false;
    }
  }

  return {
    threads,
    activeReview: reviews.find((review) => review.entryId === entryId) ?? null,
    reviewingEntryIds: new Set(reviews.map((review) => review.entryId)),
    listeners,
    startReview: (session) =>
      run(async () => {
        if (!workspaceId || !entryId) throw new Error("No entry");
        await rpcCall("review.start", { workspaceId, entryId, session });
      }, "Could not start the review."),
    create: (anchor, body) =>
      run(async () => {
        if (!workspaceId || !entryId) throw new Error("No entry");
        await rpcCall("review.create", {
          workspaceId,
          entryId,
          anchor,
          author: USER,
          body,
        });
      }, "Could not add the comment."),
    reply: (threadId, body) =>
      run(
        () => rpcCall("review.reply", { threadId, author: USER, body }),
        "Could not add the reply.",
      ),
    edit: (threadId, commentId, body) =>
      run(
        () => rpcCall("review.edit", { threadId, commentId, body }),
        "Could not update the comment.",
      ),
    remove: (threadId, commentId) =>
      run(
        () => rpcCall("review.delete", { threadId, commentId }),
        "Could not delete the comment.",
      ),
    resolve: (threadId, resolved) =>
      run(
        () => rpcCall("review.resolve", { threadId, resolved }),
        "Could not update the thread.",
      ),
    finishReview: (reviewId) =>
      run(
        () => rpcCall("review.finish", { reviewId }),
        "Could not finish the review.",
      ),
  };
}
