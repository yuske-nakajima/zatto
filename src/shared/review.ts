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
  /** anchor を引用として残し、本文には表示しない。 */
  detached?: boolean;
}

/** ファイルの中で文章を探せない未解決のスレッド。 */
export interface UnlinkedThread {
  threadId: string;
  quote: string;
}

/** スレッドをファイルの一節へ移す指定、または本文から外す指定。 */
export type ReviewLink =
  | { threadId: string; quote: string }
  | { threadId: string; detach: true };

/** 指定 1 件の結果。失敗したスレッドは変わらない。 */
export type ReviewLinkResult =
  | { threadId: string; ok: true }
  | { threadId: string; ok: false; message: string };

/** A file the user is reviewing with an LLM session; the session receives the user's comments on it. */
export interface ActiveReview {
  id: string;
  entryId: string;
  workspaceId: string;
  session: string;
  client?: ReviewClient;
  createdAt: number;
}

/** 待機中の LLM セッションが扱うもの: ユーザーの新しいコメント、文章を探せなくなったスレッド、レビューの終了。 */
export type ReviewEvent =
  | {
      kind: "comment";
      reviewId: string;
      entryId: string;
      workspaceId: string;
      threadId: string;
    }
  | {
      kind: "unlinked";
      reviewId: string;
      entryId: string;
      workspaceId: string;
      threadIds: string[];
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
  linksPerRequest: 100,
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

/** An unresolved thread whose latest comment is an LLM reply, so viewers can point at replies in files that are not open. */
export interface ReviewLatestReply {
  entryId: string;
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

/** LLM がスレッドを文章に保つための案内。MCP ツール、CLI の出力、コピーする依頼文で共有する。 */
export const REVIEW_REANCHOR_GUIDE =
  "Threads stay on the file when their commented text changes, and zatto finds lightly edited text by itself. When it cannot, reply results and an unlinked event name the thread: move it with relink_review_threads (zatto review relink <thread-id> --quote <passage>), quoting a short passage from one paragraph that appears once in the document, without adding a comment. If you deleted the text, do not relink; reply to say so. If a thread sits on the wrong text and has no right place, detach it (detach in relink_review_threads, --detach).";

/** What an LLM may use in replies and how it reads images, shared by the MCP tools and the copied request. */
export const REVIEW_REPLY_GUIDE =
  "Replies render as GitHub Flavored Markdown: paragraphs, headings, lists, task lists, tables, quotes, bold, italic, strikethrough, inline code, code blocks, and http, https, or mailto links. Raw HTML shows as plain text. To show an image, write ![alt](/absolute/path.png) with a local PNG, JPEG, WebP, or GIF file, or pass its path as an attachment: it is uploaded and rendered in place, and its path is not shown. Image URLs are not loaded; only their alt text shows. Images the user attached are listed in each comment's attachments with a local path you can read.";

/**
 * Claude Code のバックグラウンド Bash は終了時にしか通知しないため、1 行ごとに通知する Monitor で待つよう案内する。
 * Monitor の通知は長い行を途中で切るので、--brief の短い行で受け、全文は MCP で読む。
 */
export const REVIEW_MONITOR_GUIDE =
  "In Claude Code, start the command with the Monitor tool instead of a background command and add --brief: each comment then notifies you with its thread id, and you read the whole thread with get_review_thread from the zatto MCP server. Without the zatto MCP server, run it without --brief. Monitor stops after 30 minutes; start it again, and unanswered comments are delivered again.";

/**
 * A request any LLM conversation can act on: it keeps the review command running for one file.
 * @param cli - Command that runs the zatto CLI of the running server, quoted for a POSIX shell
 * @param filePath - File under review
 * @param workspaceId - Workspace the file belongs to, so the review stays there when the user selects another workspace
 * @returns Text to paste into an LLM conversation
 */
export function reviewRequestText(
  cli: string,
  filePath: string,
  workspaceId: string,
): string {
  return [
    "Please review this document with me in zatto.",
    "Run this command in the background and keep it running:",
    `${cli} review ${JSON.stringify(filePath)} --workspace ${JSON.stringify(workspaceId)}`,
    "Claude Code and Codex are detected automatically; in other tools, add --session <id> to both commands, using an ID for this conversation.",
    REVIEW_MONITOR_GUIDE,
    "When it reports that the file is under review, tell me you are ready.",
    "Each JSON line it prints is a comment I wrote. Read the document and any attached images, then answer in that thread with:",
    `${cli} review reply <thread-id> "<reply>"`,
    "Keep the command running until it exits when I finish the review. If you cannot read output while a command is running, add --once and run it again after each reply.",
    REVIEW_REANCHOR_GUIDE,
    REVIEW_REPLY_GUIDE,
  ].join("\n");
}
