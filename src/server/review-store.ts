import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import { writeFileAtomically } from "../shared/atomic-file.js";
import {
  REVIEW_LIMITS,
  type ReviewAttachment,
  type ReviewAttachmentUpload,
  type ReviewAuthor,
  type ReviewImageType,
  type ReviewLatestReply,
  type ReviewThread,
  reviewAttachmentFileName,
  type TextAnchor,
} from "../shared/review.js";
import { fileExists } from "./session-files.js";

/** Leading bytes that identify each accepted image format. */
const IMAGE_SIGNATURES: Record<ReviewImageType, (bytes: Buffer) => boolean> = {
  "image/png": (bytes) =>
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  "image/jpeg": (bytes) =>
    bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
  "image/webp": (bytes) =>
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP",
  "image/gif": (bytes) =>
    ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("latin1")),
};

/** An attachment the store refuses, reported to callers as invalid parameters. */
export class ReviewAttachmentError extends Error {}

interface ReviewDocument {
  version: 1;
  threads: ReviewThread[];
}

/** A rejected thread operation that callers report as a missing target. */
export class ReviewNotFoundError extends Error {}

/** Persists review threads separately from workspaces, with serialized atomic writes. */
export class ReviewStore {
  private threads: ReviewThread[] = [];
  private pending: Promise<unknown> = Promise.resolve();

  private readonly attachmentsDir: string;

  /**
   * @param filePath - Thread document; an empty path keeps threads only in memory
   * @param write - Atomic text writer
   */
  constructor(
    private readonly filePath: string,
    private readonly write = writeFileAtomically,
  ) {
    this.attachmentsDir = filePath
      ? path.join(path.dirname(filePath), "review-attachments")
      : path.join(os.tmpdir(), `zatto-review-attachments-${process.pid}`);
  }

  /**
   * Restores threads, keeping only those whose entry still exists.
   * @param entryExists - Whether an entry ID belongs to any workspace
   * @returns Nothing
   * @throws When the stored document is invalid or persistence fails
   */
  async load(entryExists: (id: string) => boolean): Promise<void> {
    return this.enqueue(async () => {
      if (!(await fileExists(this.filePath))) return;
      const document = parseReviewDocument(
        JSON.parse(await readFile(this.filePath, "utf8")),
      );
      const kept = document.threads.filter((thread) =>
        entryExists(thread.entryId),
      );
      this.threads = document.threads;
      if (kept.length !== document.threads.length) await this.commit(kept);
    });
  }

  /** Returns detached threads of an entry in creation order. */
  list(entryId: string): ReviewThread[] {
    return structuredClone(
      this.threads.filter((thread) => thread.entryId === entryId),
    );
  }

  /** Counts unresolved threads per entry. */
  openCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const thread of this.threads)
      if (!thread.resolved)
        counts[thread.entryId] = (counts[thread.entryId] ?? 0) + 1;
    return counts;
  }

  /** Finds the newest LLM reply in each entry. */
  latestReplies(): Record<string, ReviewLatestReply> {
    const latest: Record<string, ReviewLatestReply> = {};
    for (const thread of this.threads)
      for (const item of thread.comments) {
        if (item.author.kind !== "llm") continue;
        const current = latest[thread.entryId];
        if (current && current.createdAt >= item.createdAt) continue;
        latest[thread.entryId] = {
          threadId: thread.id,
          createdAt: item.createdAt,
          ...(item.author.client ? { client: item.author.client } : {}),
        };
      }
    return latest;
  }

  /** Counts resolved threads per entry. */
  resolvedCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const thread of this.threads)
      if (thread.resolved)
        counts[thread.entryId] = (counts[thread.entryId] ?? 0) + 1;
    return counts;
  }

  /**
   * Resolves a stored attachment file name to its path, only for attachments of existing comments.
   * @param fileName - `<id><extension>` as served to the viewer
   * @returns Absolute path and media type, or undefined
   */
  attachment(
    fileName: string,
  ): { path: string; type: ReviewImageType } | undefined {
    for (const thread of this.threads)
      for (const comment of thread.comments)
        for (const attachment of comment.attachments ?? [])
          if (reviewAttachmentFileName(attachment) === fileName)
            return { path: attachment.path, type: attachment.type };
    return undefined;
  }

  /** Returns a detached thread. */
  get(threadId: string): ReviewThread | undefined {
    const thread = this.threads.find((item) => item.id === threadId);
    return thread ? structuredClone(thread) : undefined;
  }

  /**
   * Starts a thread with its first comment; attachments are validated and stored before the thread is saved.
   * @throws ReviewAttachmentError for an invalid attachment
   */
  async create(
    entryId: string,
    anchor: TextAnchor | null,
    author: ReviewAuthor,
    body: string,
    uploads: ReviewAttachmentUpload[] = [],
  ): Promise<ReviewThread> {
    const attachments = await this.storeAttachments(uploads);
    const now = Date.now();
    const thread: ReviewThread = {
      id: nanoid(),
      entryId,
      anchor,
      resolved: false,
      createdAt: now,
      comments: [comment(author, body, now, attachments)],
    };
    return this.enqueue(async () => {
      try {
        await this.commit([...this.threads, thread]);
      } catch (error) {
        await removeAttachments(attachments);
        throw error;
      }
      return structuredClone(thread);
    });
  }

  /**
   * Adds a comment, moving the thread to a new anchor when one is given.
   * @throws ReviewAttachmentError for an invalid attachment
   */
  async reply(
    threadId: string,
    author: ReviewAuthor,
    body: string,
    uploads: ReviewAttachmentUpload[] = [],
    anchor?: TextAnchor,
  ): Promise<ReviewThread> {
    if (!this.threads.some((thread) => thread.id === threadId))
      throw new ReviewNotFoundError("Thread not found.");
    const attachments = await this.storeAttachments(uploads);
    try {
      return await this.update(threadId, (thread) => ({
        ...thread,
        anchor: anchor ?? thread.anchor,
        comments: [
          ...thread.comments,
          comment(author, body, Date.now(), attachments),
        ],
      }));
    } catch (error) {
      await removeAttachments(attachments);
      throw error;
    }
  }

  async setResolved(
    threadId: string,
    resolved: boolean,
  ): Promise<ReviewThread> {
    return this.update(threadId, (thread) => ({ ...thread, resolved }));
  }

  /**
   * Deletes threads of entries that no longer exist in any workspace.
   * @param entryExists - Whether an entry ID belongs to any workspace
   * @returns Whether any thread was deleted
   */
  async prune(entryExists: (id: string) => boolean): Promise<boolean> {
    return this.enqueue(async () => {
      const kept = this.threads.filter((thread) => entryExists(thread.entryId));
      if (kept.length === this.threads.length) return false;
      const removed = this.threads.filter((thread) => !kept.includes(thread));
      await this.commit(kept);
      await removeAttachments(
        removed.flatMap((thread) =>
          thread.comments.flatMap((item) => item.attachments ?? []),
        ),
      );
      return true;
    });
  }

  private async storeAttachments(
    uploads: ReviewAttachmentUpload[],
  ): Promise<ReviewAttachment[]> {
    if (uploads.length > REVIEW_LIMITS.attachmentsPerComment)
      throw new ReviewAttachmentError(
        `Attach at most ${REVIEW_LIMITS.attachmentsPerComment} images.`,
      );
    const decoded = uploads.map((upload) => {
      const bytes = Buffer.from(upload.data, "base64");
      if (!bytes.length || bytes.length > REVIEW_LIMITS.attachmentBytes)
        throw new ReviewAttachmentError(
          `Images must be at most ${REVIEW_LIMITS.attachmentBytes} bytes.`,
        );
      if (!IMAGE_SIGNATURES[upload.type](bytes))
        throw new ReviewAttachmentError(
          `${upload.name} is not a valid ${upload.type} image.`,
        );
      return { upload, bytes };
    });
    if (!decoded.length) return [];
    await mkdir(this.attachmentsDir, { recursive: true });
    const stored: ReviewAttachment[] = [];
    try {
      for (const { upload, bytes } of decoded) {
        const id = nanoid();
        const attachment: ReviewAttachment = {
          id,
          name: upload.name,
          type: upload.type,
          path: path.join(
            this.attachmentsDir,
            reviewAttachmentFileName({ id, type: upload.type }),
          ),
        };
        await writeFile(attachment.path, bytes, { flag: "wx" });
        stored.push(attachment);
      }
    } catch (error) {
      await removeAttachments(stored);
      throw error;
    }
    return stored;
  }

  private async update(
    threadId: string,
    change: (thread: ReviewThread) => ReviewThread,
  ): Promise<ReviewThread> {
    return this.enqueue(async () => {
      const updated = change(this.require(threadId));
      await this.replace(updated);
      return structuredClone(updated);
    });
  }

  private async replace(thread: ReviewThread): Promise<void> {
    await this.commit(
      this.threads.map((item) => (item.id === thread.id ? thread : item)),
    );
  }

  private require(threadId: string): ReviewThread {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) throw new ReviewNotFoundError("Thread not found.");
    return thread;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => undefined);
    return next;
  }

  private async commit(threads: ReviewThread[]): Promise<void> {
    const document: ReviewDocument = { version: 1, threads };
    await this.write(this.filePath, `${JSON.stringify(document, null, 2)}\n`);
    this.threads = threads;
  }
}

function comment(
  author: ReviewAuthor,
  body: string,
  createdAt: number,
  attachments: ReviewAttachment[],
) {
  return {
    id: nanoid(),
    author,
    body,
    createdAt,
    ...(attachments.length ? { attachments } : {}),
  };
}

async function removeAttachments(attachments: ReviewAttachment[]) {
  await Promise.all(
    attachments.map((attachment) =>
      rm(attachment.path, { force: true }).catch(() => undefined),
    ),
  );
}

function parseReviewDocument(value: unknown): ReviewDocument {
  const document = value as Partial<ReviewDocument> | null;
  if (
    document?.version !== 1 ||
    !Array.isArray(document.threads) ||
    !document.threads.every(isThread)
  )
    throw new Error("Invalid review thread document.");
  return { version: 1, threads: document.threads };
}

function isThread(value: unknown): value is ReviewThread {
  const thread = value as Partial<ReviewThread> | null;
  return (
    !!thread &&
    typeof thread.id === "string" &&
    typeof thread.entryId === "string" &&
    typeof thread.resolved === "boolean" &&
    typeof thread.createdAt === "number" &&
    (thread.anchor === null ||
      (typeof thread.anchor?.exact === "string" &&
        typeof thread.anchor.prefix === "string" &&
        typeof thread.anchor.suffix === "string")) &&
    Array.isArray(thread.comments) &&
    thread.comments.length > 0 &&
    thread.comments.every(
      (comment) =>
        typeof comment?.id === "string" &&
        typeof comment.body === "string" &&
        typeof comment.createdAt === "number" &&
        (comment.author?.kind === "user" || comment.author?.kind === "llm"),
    )
  );
}
