import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { viewableKind } from "./viewable-file.js";

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
 * Reads an HTML title or the first Markdown heading, falling back to the filename.
 * @param absPath - File path
 * @returns Display title
 * @throws When the file cannot be read
 */
export async function extractTitle(absPath: string): Promise<string> {
  const source = await readFile(absPath, "utf8");
  const rawTitle =
    viewableKind(absPath) === "markdown"
      ? markdownTitle(source)
      : source
          .match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
          ?.replace(/\s+/g, " ")
          .trim();
  return rawTitle || path.basename(absPath);
}

/** Returns the first level-one ATX heading outside fenced code blocks. */
function markdownTitle(source: string): string | undefined {
  let fence: string | null = null;
  for (const line of source.split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = line.match(/^ {0,3}#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/)?.[1];
    if (heading?.trim()) return heading.replace(/\s+/g, " ").trim();
  }
  return undefined;
}
