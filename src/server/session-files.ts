import { access, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Checks whether a path is accessible.
 * @param targetPath - File path
 * @returns Whether access succeeds
 * @throws Never; inaccessible files return false
 */
export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
/**
 * Reads an HTML title or uses its filename.
 * @param absPath - File path
 * @returns Display title
 * @throws When the file cannot be read
 */
export async function extractTitle(absPath: string): Promise<string> {
  const html = await readFile(absPath, "utf8");
  const rawTitle = html
    .match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  return rawTitle || path.basename(absPath);
}
