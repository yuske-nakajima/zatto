import { open } from "node:fs/promises";
import { SEARCH_LIMITS } from "./search-constants.js";
import type { Entry } from "./session.js";

export class SearchFileFailure extends Error {
  constructor(
    readonly code: "SEARCH_FILE_UNREADABLE" | "SEARCH_FILE_TOO_LARGE",
    readonly entryId: string,
    readonly statusCode: 413 | 500,
    message: string,
  ) {
    super(message);
  }
}

interface BoundedHtmlRead {
  html: string | null;
  bytesRead: number;
}

/**
 * Reads an entry through an already-open descriptor and enforces the byte limit
 * again while reading, so a file that grows after stat cannot exceed the bound.
 */
export async function readBoundedHtml(
  entry: Entry,
  remainingBytes: number,
): Promise<BoundedHtmlRead> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(entry.absPath, "r");
    const stats = await handle.stat();
    if (stats.size > SEARCH_LIMITS.fileBytes) {
      throw fileTooLarge(entry.id);
    }
    if (stats.size > remainingBytes) {
      return { html: null, bytesRead: 0 };
    }
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < stats.size) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, stats.size - offset),
      );
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(chunk.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const finalStats = await handle.stat();
    if (finalStats.size > SEARCH_LIMITS.fileBytes) {
      throw fileTooLarge(entry.id);
    }
    if (finalStats.size > remainingBytes || finalStats.size !== offset) {
      return { html: null, bytesRead: offset };
    }
    return {
      html: Buffer.concat(chunks, offset).toString("utf8"),
      bytesRead: offset,
    };
  } catch (error) {
    if (error instanceof SearchFileFailure) {
      throw error;
    }
    throw new SearchFileFailure(
      "SEARCH_FILE_UNREADABLE",
      entry.id,
      500,
      "An HTML file could not be read.",
    );
  } finally {
    await handle?.close();
  }
}

function fileTooLarge(entryId: string): SearchFileFailure {
  return new SearchFileFailure(
    "SEARCH_FILE_TOO_LARGE",
    entryId,
    413,
    "An HTML file is too large to search.",
  );
}
