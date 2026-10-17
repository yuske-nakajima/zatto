/** Locates commented text by its content rather than coordinates, so layout and edits do not move it. */
export interface TextAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

/** Who wrote a comment; LLM comments record the session that wrote them when known. */
export type ReviewAuthor = { kind: "user" } | { kind: "llm"; session?: string };

export interface ReviewComment {
  id: string;
  author: ReviewAuthor;
  body: string;
  createdAt: number;
  updatedAt?: number;
}

/** A discussion attached to text in a document, or to the whole document when the anchor is null. */
export interface ReviewThread {
  id: string;
  entryId: string;
  anchor: TextAnchor | null;
  resolved: boolean;
  createdAt: number;
  comments: ReviewComment[];
}

/** A file the user is reviewing with an LLM session; the session receives the user's comments on it. */
export interface ActiveReview {
  id: string;
  entryId: string;
  workspaceId: string;
  session: string;
  createdAt: number;
}

/** An LLM session waiting through `zatto review`, offered to the user as a review recipient. */
export interface ReviewListener {
  session: string;
  lastSeenAt: number;
}

/** Something the waiting LLM session must handle: a new user comment, or the user finishing a review. */
export type ReviewEvent =
  | {
      kind: "comment";
      reviewId: string;
      entryId: string;
      workspaceId: string;
      threadId: string;
    }
  | {
      kind: "finished";
      reviewId: string;
      entryId: string;
      workspaceId: string;
    };

export const REVIEW_LIMITS = {
  bodyLength: 10_000,
  anchorTextLength: 2_000,
  contextLength: 64,
  /** Listeners not seen for this long are not offered as recipients. */
  listenerTtlMs: 30 * 60 * 1000,
} as const;
