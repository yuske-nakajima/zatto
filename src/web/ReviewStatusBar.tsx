import { useEffect, useState } from "react";
import type { Entry } from "../server/session.js";
import { Avatar, clientName, REPLY_WAIT_MS } from "./ReviewLayer.js";
import { useSeenReplies } from "./review-seen.js";
import type { ReviewThreads } from "./useReviewThreads.js";

/**
 * Tells in the status bar what the reviewing LLMs are doing, including files that are not open:
 * thinking about a comment, a reply not yet opened, or the number of files under review.
 */
export function ReviewStatusBar({
  review,
  entries,
  onOpen,
}: {
  review: ReviewThreads;
  entries: readonly Entry[];
  onOpen: (entryId: string, threadId: string) => void;
}) {
  const seen = useSeenReplies();
  const [now, setNow] = useState(() => Date.now());
  const thinking = Object.values(review.deliveries)
    .filter(
      (delivery) =>
        delivery.status === "delivered" && now < delivery.since + REPLY_WAIT_MS,
    )
    .sort((a, b) => b.since - a.since)[0];
  const expiresAt = thinking ? thinking.since + REPLY_WAIT_MS : 0;
  useEffect(() => {
    setNow(Date.now());
    if (!expiresAt) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  if (thinking) {
    const client = review.reviews.find(
      (item) => item.entryId === thinking.entryId,
    )?.client;
    return (
      <span className="review-status review-status--thinking" role="status">
        <Avatar author={{ kind: "llm", ...(client ? { client } : {}) }} />
        {clientName(client)} is thinking
        <span className="review-status-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </span>
    );
  }

  const reply = Object.entries(review.latestReplies)
    .map(([entryId, latest]) => ({
      ...latest,
      entry: entries.find((item) => item.id === entryId),
    }))
    .filter(
      (item) => item.entry && seen.isUnseen(item.threadId, item.createdAt),
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (reply?.entry) {
    const { entry } = reply;
    return (
      <button
        type="button"
        key={`${reply.threadId}:${reply.createdAt}`}
        className="review-status review-status--reply"
        data-status-description="Open the thread with the new reply."
        onClick={() => onOpen(entry.id, reply.threadId)}
      >
        <Avatar
          author={{
            kind: "llm",
            ...(reply.client ? { client: reply.client } : {}),
          }}
        />
        {clientName(reply.client)} replied · {entry.title} ›
      </button>
    );
  }

  if (!review.reviews.length) return null;
  return (
    <span className="review-status">
      Reviewing {review.reviews.length}{" "}
      {review.reviews.length === 1 ? "file" : "files"}
    </span>
  );
}
