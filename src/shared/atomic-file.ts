import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

/** Hooks around the sync and rename boundaries of an atomic file replacement. */
export interface AtomicWriteHooks {
  afterSync?: () => void;
  beforeRename?: () => void;
}

/**
 * Replaces a local file through a synced temporary file in the same directory.
 *
 * @param targetPath - Destination file path
 * @param content - UTF-8 text to persist
 * @param hooks - Optional sync and rename boundary hooks
 * @returns A promise that resolves after the atomic rename
 * @throws {Error} When directory creation, writing, syncing, or renaming fails
 */
export async function writeFileAtomically(
  targetPath: string,
  content: string,
  hooks: AtomicWriteHooks = {},
): Promise<void> {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle: FileHandle | undefined = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
    hooks.afterSync?.();
    await handle.close();
    handle = undefined;
    hooks.beforeRename?.();
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
