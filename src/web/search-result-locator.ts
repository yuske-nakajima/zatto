import type { SearchLineMatch } from "../shared/search.js";
import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";
import { truncateUnicode } from "../shared/text.js";
import type { SearchResultLocator } from "./search-navigation-url.js";

const CONTEXT_LENGTH = 40;
const MARKER_ATTRIBUTE = "data-zatto-search-target";

export function createSearchResultLocator(
  entryId: string,
  line: SearchLineMatch,
  ordinal: number,
  query: string,
  rangeIndex = 0,
): SearchResultLocator | null {
  const range = line.ranges[rangeIndex];
  if (!range || line.truncated) {
    return null;
  }
  const matchEnd = range.start + range.length;
  const matchText = line.lineText.slice(range.start, matchEnd);
  const context = readVisibleContext(
    line.lineText,
    range.start,
    matchEnd,
    matchText,
  );
  if (!context) {
    return null;
  }
  return {
    entryId,
    lineNumber: line.lineNumber,
    offset: line.startOffset + range.start,
    length: range.length,
    ordinal,
    matchText:
      matchText === query
        ? null
        : truncateUnicode(matchText, SEARCH_QUERY_MAX_LENGTH),
    prefix: truncateUnicode(context.prefix, CONTEXT_LENGTH, "end"),
    suffix: truncateUnicode(context.suffix, CONTEXT_LENGTH),
  };
}

function readVisibleContext(
  source: string,
  start: number,
  end: number,
  matchText: string,
): { prefix: string; suffix: string } | null {
  try {
    const template = document.createElement("template");
    template.innerHTML = `${source.slice(0, start)}<span ${MARKER_ATTRIBUTE}>${escapeHtml(matchText)}</span>${source.slice(end)}`;
    const markers = template.content.querySelectorAll(`[${MARKER_ATTRIBUTE}]`);
    const marker = markers.length === 1 ? markers[0] : null;
    if (
      !marker?.parentElement ||
      marker.textContent !== matchText ||
      !isVisible(marker)
    ) {
      return null;
    }
    return {
      prefix: normalizeText(marker.previousSibling?.textContent ?? ""),
      suffix: normalizeText(marker.nextSibling?.textContent ?? ""),
    };
  } catch {
    return null;
  }
}

function isVisible(element: Element): boolean {
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      ["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(current.tagName) ||
      current.hasAttribute("hidden") ||
      current.getAttribute("aria-hidden") === "true" ||
      current
        .getAttribute("style")
        ?.match(/(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))/iu)
    ) {
      return false;
    }
  }
  return true;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
