import { readFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import { writeFileAtomically } from "../shared/atomic-file.js";
import type {
  ReviewAuthor,
  ReviewThread,
  TextAnchor,
} from "../shared/review.js";
import { fileExists } from "./session-files.js";

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

  constructor(
    private readonly filePath: string,
    private readonly write = writeFileAtomically,
  ) {}

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

  /** Returns a detached thread. */
  get(threadId: string): ReviewThread | undefined {
    const thread = this.threads.find((item) => item.id === threadId);
    return thread ? structuredClone(thread) : undefined;
  }

  async create(
    entryId: string,
    anchor: TextAnchor | null,
    author: ReviewAuthor,
    body: string,
  ): Promise<ReviewThread> {
    const now = Date.now();
    const thread: ReviewThread = {
      id: nanoid(),
      entryId,
      anchor,
      resolved: false,
      createdAt: now,
      comments: [{ id: nanoid(), author, body, createdAt: now }],
    };
    return this.enqueue(async () => {
      await this.commit([...this.threads, thread]);
      return structuredClone(thread);
    });
  }

  async reply(
    threadId: string,
    author: ReviewAuthor,
    body: string,
  ): Promise<ReviewThread> {
    return this.update(threadId, (thread) => ({
      ...thread,
      comments: [
        ...thread.comments,
        { id: nanoid(), author, body, createdAt: Date.now() },
      ],
    }));
  }

  async editComment(
    threadId: string,
    commentId: string,
    body: string,
  ): Promise<ReviewThread> {
    return this.update(threadId, (thread) => {
      if (!thread.comments.some((comment) => comment.id === commentId))
        throw new ReviewNotFoundError("Comment not found.");
      return {
        ...thread,
        comments: thread.comments.map((comment) =>
          comment.id === commentId
            ? { ...comment, body, updatedAt: Date.now() }
            : comment,
        ),
      };
    });
  }

  /**
   * Deletes a comment; deleting the last remaining comment deletes the thread.
   * @returns The remaining thread, or null when the thread was deleted
   */
  async deleteComment(
    threadId: string,
    commentId: string,
  ): Promise<ReviewThread | null> {
    return this.enqueue(async () => {
      const thread = this.require(threadId);
      const comments = thread.comments.filter(
        (comment) => comment.id !== commentId,
      );
      if (comments.length === thread.comments.length)
        throw new ReviewNotFoundError("Comment not found.");
      if (!comments.length) {
        await this.commit(this.threads.filter((item) => item.id !== threadId));
        return null;
      }
      const updated = { ...thread, comments };
      await this.replace(updated);
      return structuredClone(updated);
    });
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
      await this.commit(kept);
      return true;
    });
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
