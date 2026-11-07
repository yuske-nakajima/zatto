import { readFile } from "node:fs/promises";
import { compactText } from "../shared/review-match.js";
import { renderMarkdownDocument } from "./markdown-view.js";
import { viewableKind } from "./viewable-file.js";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Reads the text a viewer shows for a file, with all whitespace removed.
 * Rendered text breaks lines differently from the source, so comparisons ignore whitespace.
 * @param filePath - Registered HTML or Markdown file
 * @returns Visible text without whitespace
 * @throws When the file cannot be read
 */
export async function visibleText(filePath: string): Promise<string> {
  const source = await readFile(filePath, "utf8");
  const html =
    viewableKind(filePath) === "markdown"
      ? renderMarkdownDocument(source, "")
      : source;
  return compactText(
    decodeEntities(
      html
        .replace(
          /<(script|style|title|noscript|template)\b[\s\S]*?<\/\1\s*>/gi,
          " ",
        )
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]*>/g, " "),
    ),
  );
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X"))
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      return ENTITIES[name.toLowerCase()] ?? match;
    },
  );
}
