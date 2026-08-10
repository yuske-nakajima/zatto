import { readFile } from "node:fs/promises";
import {
  type AtomicWriteHooks,
  writeFileAtomically,
} from "../shared/atomic-file.js";
import {
  parseSessionExchange,
  type SessionExchange,
} from "../shared/session-exchange.js";

/**
 * Reads and validates a session exchange JSON file.
 *
 * @param filePath - Path to the exchange JSON file
 * @returns The validated exchange document
 * @throws {Error} When the file cannot be read, parsed, or validated
 */
export async function readSessionExchangeFile(
  filePath: string,
): Promise<SessionExchange> {
  const content = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error(`セッションファイルの JSON が不正です: ${filePath}`);
  }
  return parseSessionExchange(parsed);
}

/**
 * Writes a session exchange document as formatted JSON.
 *
 * @param filePath - Destination path for the exchange JSON file
 * @param exchange - Validated exchange document to write
 * @param hooks - Optional sync and rename boundary hooks
 * @returns A promise that resolves after the file is written
 * @throws {Error} When the destination cannot be written
 */
export async function writeSessionExchangeFile(
  filePath: string,
  exchange: SessionExchange,
  hooks: AtomicWriteHooks = {},
): Promise<void> {
  await writeFileAtomically(
    filePath,
    `${JSON.stringify(exchange, null, 2)}\n`,
    hooks,
  );
}
