import { stat } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Entry } from "./session.js";

/** Indicates that imported session paths cannot be restored safely. */
export class SessionImportValidationError extends Error {
  /**
   * Creates an import validation error with a user-facing explanation.
   *
   * @param message - Explanation of the invalid imported path
   * @param cause - Filesystem or title-reading error that prevented restoration
   */
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "SessionImportValidationError";
  }
}

/**
 * Validates imported paths and regenerates their session metadata.
 *
 * @param inputPaths - Absolute HTML file paths in display order
 * @param readTitle - Title reader for a validated HTML file
 * @returns Regenerated session entries in the same order
 * @throws {SessionImportValidationError} When a path cannot be imported
 */
export async function createImportedEntries(
  inputPaths: readonly string[],
  readTitle: (absPath: string) => Promise<string>,
): Promise<Entry[]> {
  const normalizedPaths = inputPaths.map(normalizeImportedPath);
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new SessionImportValidationError(
      "entries に重複した path を指定できません",
    );
  }
  const entries: Entry[] = [];
  for (const absPath of normalizedPaths) {
    await validateRegularFile(absPath);
    let title: string;
    try {
      title = await readTitle(absPath);
    } catch (error) {
      throw new SessionImportValidationError(
        `HTML ファイルを読み取れません: ${absPath}`,
        error,
      );
    }
    entries.push({
      id: nanoid(),
      absPath,
      title,
      addedAt: Date.now(),
    });
  }
  return entries;
}

function normalizeImportedPath(inputPath: string): string {
  if (!path.isAbsolute(inputPath)) {
    throw new SessionImportValidationError(
      `絶対パスを指定してください: ${inputPath}`,
    );
  }
  const absPath = path.resolve(inputPath);
  if (![".htm", ".html"].includes(path.extname(absPath).toLowerCase())) {
    throw new SessionImportValidationError(
      `HTML ファイルを指定してください: ${absPath}`,
    );
  }
  return absPath;
}

async function validateRegularFile(absPath: string): Promise<void> {
  try {
    const fileStats = await stat(absPath);
    if (!fileStats.isFile()) {
      throw new SessionImportValidationError(
        `ファイルを指定してください: ${absPath}`,
      );
    }
  } catch (error) {
    if (error instanceof SessionImportValidationError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SessionImportValidationError(
        `ファイルが見つかりません: ${absPath}`,
        error,
      );
    }
    throw new SessionImportValidationError(
      `ファイルを復元できません: ${absPath}`,
      error,
    );
  }
}
