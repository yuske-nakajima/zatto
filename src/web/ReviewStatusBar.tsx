import { useEffect, useState } from "react";
import type { Entry } from "../server/session.js";
import {
  Avatar,
  clientName,
  formatCommentTime,
  REPLY_WAIT_MS,
} from "./ReviewLayer.js";
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
  onOpenComments,
}: {
  review: ReviewThreads;
  entries: readonly Entry[];
  onOpen: (entryId: string, threadId: string) => void;
  /** Opens a file with its Comments list, from the list of files with unseen replies. */
  onOpenComments: (entryId: string) => void;
}) {
  const seen = useSeenReplies();
  const [isListOpen, setIsListOpen] = useState(false);
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

  const unseen = Object.entries(review.latestReplies)
    .flatMap(([entryId, latest]) => {
      const entry = entries.find((item) => item.id === entryId);
      return entry && seen.isUnseen(latest.threadId, latest.createdAt)
        ? [{ ...latest, entry }]
        : [];
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const reply = unseen[0];
  if (reply) {
    const { entry } = reply;
    const others = unseen.length - 1;
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: マウスを重ねたときに一覧を出すための入れ物で、操作は中の button が受ける
      <span
        className="review-status-group"
        onMouseEnter={() => setIsListOpen(true)}
        onMouseLeave={() => setIsListOpen(false)}
        onFocus={() => setIsListOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setIsListOpen(false);
        }}
      >
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
          {others > 0 && <span className="review-status-count">+{others}</span>}
        </button>
        {isListOpen && (
          <ul
            className="review-status-list"
            aria-label="Files with new replies"
          >
            {unseen.map((item) => (
              <li key={item.entry.id}>
                <button
                  type="button"
                  data-status-description="Open this file with its comments."
                  onClick={() => {
                    setIsListOpen(false);
                    onOpenComments(item.entry.id);
                  }}
                >
                  <Avatar
                    author={{
                      kind: "llm",
                      ...(item.client ? { client: item.client } : {}),
                    }}
                  />
                  <span className="review-status-list-title">
                    {item.entry.title}
                  </span>
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {formatCommentTime(item.createdAt)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </span>
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
