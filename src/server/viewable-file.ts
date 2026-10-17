import path from "node:path";

/** Document formats the viewer can display. */
export type ViewableKind = "html" | "markdown";

const KINDS = new Map<string, ViewableKind>([
  [".html", "html"],
  [".htm", "html"],
  [".md", "markdown"],
  [".markdown", "markdown"],
]);

/**
 * Classifies a path by extension, ignoring case.
 * @param filePath - File path or name
 * @returns The document format, or null when the viewer cannot display it
 * @throws Never
 */
export function viewableKind(filePath: string): ViewableKind | null {
  return KINDS.get(path.extname(filePath).toLowerCase()) ?? null;
}
