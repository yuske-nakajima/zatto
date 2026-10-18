/** Locates commented text by its content rather than coordinates, so layout and edits do not move it. */
export interface TextAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

/** Who wrote a comment; LLM comments record the session that wrote them when known. */
/** LLM clients zatto can tell apart; others are recorded without a client. */
export const REVIEW_CLIENTS = ["claude", "codex"] as const;
export type ReviewClient = (typeof REVIEW_CLIENTS)[number];

export type ReviewAuthor =
  | { kind: "user" }
  | { kind: "llm"; session?: string; client?: ReviewClient };

/** An image attached to a comment; path is where the server stored it, for LLMs that read local files. */
export interface ReviewAttachment {
  id: string;
  name: string;
  type: ReviewImageType;
  path: string;
}

/** An image sent with a new comment, encoded as base64. */
export interface ReviewAttachmentUpload {
  name: string;
  type: ReviewImageType;
  data: string;
}

export const REVIEW_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export type ReviewImageType = (typeof REVIEW_IMAGE_TYPES)[number];

const REVIEW_IMAGE_EXTENSIONS: Record<ReviewImageType, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** File name an attachment is stored and served under. */
export function reviewAttachmentFileName(attachment: {
  id: string;
  type: ReviewImageType;
}): string {
  return `${attachment.id}${REVIEW_IMAGE_EXTENSIONS[attachment.type]}`;
}

export interface ReviewComment {
  id: string;
  author: ReviewAuthor;
  body: string;
  createdAt: number;
  attachments?: ReviewAttachment[];
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
  client?: ReviewClient;
  createdAt: number;
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
  attachmentsPerComment: 4,
  attachmentBytes: 5 * 1024 * 1024,
} as const;

/**
 * Whether the reviewing session has taken the user's latest comment on a thread.
 * Present only for threads under review whose latest comment is the user's.
 */
export interface ReviewDelivery {
  entryId: string;
  status: "undelivered" | "delivered";
  since: number;
}

/** The newest LLM reply in an entry, so viewers can point at replies in files that are not open. */
export interface ReviewLatestReply {
  threadId: string;
  createdAt: number;
  client?: ReviewClient;
}

/** Files under review, thread counts per entry, and delivery of comments awaiting an LLM reply. */
export interface ReviewStates {
  reviews: ActiveReview[];
  openThreadCounts: Record<string, number>;
  resolvedThreadCounts: Record<string, number>;
  deliveries: Record<string, ReviewDelivery>;
  latestReplies: Record<string, ReviewLatestReply>;
}

/** How an LLM keeps a thread on text it edited, shared by the MCP tools, the CLI output, and the copied request. */
export const REVIEW_REANCHOR_GUIDE =
  "If you edit the commented text, reply with the edited passage as --quote (quote in reply_review_thread) so the thread follows it; quote a short passage from one paragraph that appears once in the document. A reply without it is refused while the commented text is missing from the file.";

/** What an LLM may use in replies and how it reads images, shared by the MCP tools and the copied request. */
export const REVIEW_REPLY_GUIDE =
  "Replies render as Markdown limited to paragraphs, bulleted and numbered lists, bold, inline code, fenced code blocks, and links; other syntax shows as plain text. Images the user attached are listed in each comment's attachments with a local path you can read.";

/**
 * A request any LLM conversation can act on: it keeps the review command running for one file.
 * @param cli - Command that runs the zatto CLI of the running server, quoted for a POSIX shell
 * @param filePath - File under review
 * @returns Text to paste into an LLM conversation
 */
export function reviewRequestText(cli: string, filePath: string): string {
  return [
    "Please review this document with me in zatto.",
    "Run this command in the background and keep it running:",
    `${cli} review ${JSON.stringify(filePath)}`,
    "Claude Code and Codex are detected automatically; in other tools, add --session <id> to both commands, using an ID for this conversation.",
    "When it reports that the file is under review, tell me you are ready.",
    "Each JSON line it prints is a comment I wrote. Read the document and any attached images, then answer in that thread with:",
    `${cli} review reply <thread-id> "<reply>"`,
    "Keep the command running until it exits when I finish the review. If you cannot read output while a command is running, add --once and run it again after each reply.",
    REVIEW_REANCHOR_GUIDE,
    REVIEW_REPLY_GUIDE,
  ].join("\n");
}
