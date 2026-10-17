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

/** A pending request from a waiting command for the user to review a document. */
export interface ReviewRequest {
  id: string;
  entryId: string;
  workspaceId: string;
  session?: string;
  createdAt: number;
}

export const REVIEW_LIMITS = {
  bodyLength: 10_000,
  anchorTextLength: 2_000,
  contextLength: 64,
} as const;
