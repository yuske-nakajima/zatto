import { useCallback, useEffect, useEffectEvent, useState } from "react";
import type { ServerMessage } from "../shared/protocol.js";
import type {
  ActiveReview,
  ReviewAttachmentUpload,
  ReviewDelivery,
  ReviewStates,
  ReviewThread,
  TextAnchor,
} from "../shared/review.js";
import { rpcCall } from "../shared/rpc-client.js";
import type { ReviewFileStates } from "./review-status-context.js";
import { subscribeServerMessages } from "./server-messages.js";

const USER = { kind: "user" } as const;

export interface ReviewThreads {
  threads: ReviewThread[];
  /** The review of the selected entry, if the user is reviewing it with an LLM session. */
  activeReview: ActiveReview | null;
  /** Entries under review and thread counts, for labelling the file list. */
  fileStates: ReviewFileStates;
  /** Request to paste into an LLM conversation for the selected entry; null until loaded. */
  requestText: string | null;
  /** Whether the reviewing session took the user's latest comment, by thread ID. */
  deliveries: Readonly<Record<string, ReviewDelivery>>;
  /** Resolves to the new thread's ID, or null when the comment was not saved. */
  create: (
    anchor: TextAnchor | null,
    body: string,
    attachments: ReviewAttachmentUpload[],
  ) => Promise<string | null>;
  reply: (
    threadId: string,
    body: string,
    attachments: ReviewAttachmentUpload[],
  ) => Promise<boolean>;
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
  const [states, setStates] = useState<ReviewStates>({
    reviews: [],
    openThreadCounts: {},
    resolvedThreadCounts: {},
    deliveries: {},
  });

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

  const [requestText, setRequestText] = useState<string | null>(null);
  useEffect(() => {
    setRequestText(null);
    if (!workspaceId || !entryId) return;
    let current = true;
    // クリップボードへの書込みはクリック直後でないと拒まれることがあるため、先に取得しておく
    void rpcCall("review.request", { workspaceId, entryId })
      .then((result) => {
        if (current) setRequestText(result.text);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [workspaceId, entryId]);

  const handleMessage = useEffectEvent((message: ServerMessage) => {
    if (
      message.type === "review:update" &&
      (message.entryId === entryId || message.entryId === "")
    )
      void refresh();
    if (message.type === "review:states") {
      const { type: _type, ...next } = message;
      setStates(next);
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
      .then(setStates)
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

  const { reviews } = states;
  return {
    threads,
    activeReview: reviews.find((review) => review.entryId === entryId) ?? null,
    fileStates: {
      reviewing: new Set(reviews.map((review) => review.entryId)),
      openThreadCounts: states.openThreadCounts,
      resolvedThreadCounts: states.resolvedThreadCounts,
    },
    deliveries: states.deliveries,
    requestText,
    create: async (anchor, body, attachments) => {
      let threadId: string | null = null;
      await run(async () => {
        if (!workspaceId || !entryId) throw new Error("No entry");
        threadId = (
          await rpcCall("review.create", {
            workspaceId,
            entryId,
            anchor,
            author: USER,
            body,
            ...(attachments.length ? { attachments } : {}),
          })
        ).id;
      }, "Could not add the comment.");
      return threadId;
    },
    reply: (threadId, body, attachments) =>
      run(
        () =>
          rpcCall("review.reply", {
            threadId,
            author: USER,
            body,
            ...(attachments.length ? { attachments } : {}),
          }),
        "Could not add the reply.",
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
