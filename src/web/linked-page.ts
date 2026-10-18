import type { Entry } from "../server/session.js";

const VIEWABLE_EXTENSION = /\.(?:html?|md|markdown)$/i;

/** A page the preview reached by following a link from the selected entry. */
export interface LinkedPage {
  absPath: string;
  /** Whether zatto can register and display the file. */
  isViewable: boolean;
}

/**
 * Resolves the file shown in the preview when it differs from the selected entry.
 * Preview URLs are `/f/<entry id>/<path relative to the entry's directory>`.
 * @param entry - Selected entry
 * @param pathname - Path of the document loaded in the preview
 * @returns The linked page, or null while the preview shows the entry itself
 */
export function linkedPageOf(
  entry: Entry,
  pathname: string,
): LinkedPage | null {
  const prefix = `/f/${encodeURIComponent(entry.id)}/`;
  if (!pathname.startsWith(prefix) || pathname === prefix) return null;
  const separator = entry.absPath.includes("/") ? "/" : "\\";
  const directory = entry.absPath.slice(
    0,
    entry.absPath.lastIndexOf(separator) + 1,
  );
  const relative = pathname
    .slice(prefix.length)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join(separator);
  return {
    absPath: `${directory}${relative}`,
    isViewable: VIEWABLE_EXTENSION.test(relative),
  };
}
