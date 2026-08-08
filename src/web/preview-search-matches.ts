import type { PreviewSearchTargetOptions } from "./preview-search-target.js";

export interface PreviewTextMatch {
  node: Text;
  start: number;
  length: number;
  container: Element;
}

export interface LocatedPreviewTextMatch {
  document: Document;
  match: PreviewTextMatch;
}

const EXCLUDED_ELEMENTS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
const MAX_TEXT_NODES = 5_000;
const MAX_TEXT_LENGTH = 1_000_000;
const MAX_MATCHES = 1_000;

/**
 * プレビュー文書から可視テキストの一致箇所を収集する。
 *
 * @param document - 検索対象の文書
 * @param needle - 大文字小文字を区別しない固定検索文字列
 * @returns 可視一致の一覧。安全上限を超えた場合はnull
 */
export function collectVisiblePreviewMatches(
  document: Document,
  needle: string,
): PreviewTextMatch[] | null {
  if (needle.length === 0) return [];
  const matches = collectMatches(document, needle);
  return matches?.filter((match) => match.visible) ?? null;
}

export function findPreviewSearchMatch(
  options: PreviewSearchTargetOptions,
): LocatedPreviewTextMatch | null {
  if (options.query.trim().length === 0) return null;
  const document = resolveDocument(options.source);
  if (!document) return null;
  const needle =
    options.matchText && options.matchText.trim().length > 0
      ? options.matchText
      : options.query;
  const matches = collectMatches(document, needle);
  if (!matches) return null;
  const match = chooseMatch(matches, options);
  return match ? { document, match } : null;
}

function chooseMatch(
  matches: Array<PreviewTextMatch & { visible: boolean }>,
  options: PreviewSearchTargetOptions,
): PreviewTextMatch | null {
  const hasContext =
    options.prefixHint !== undefined || options.suffixHint !== undefined;
  if (!hasContext) return null;
  const visibleMatches = matches.filter((match) => match.visible);
  if (options.prefixHint === "" && options.suffixHint === "") {
    return visibleMatches.length === 1 ? visibleMatches[0] : null;
  }
  const prefixPattern = contextPattern(options.prefixHint ?? "", "prefix");
  const suffixPattern = contextPattern(options.suffixHint ?? "", "suffix");
  const supported = matches.filter((match) => {
    const before = match.node.data.slice(0, match.start);
    const after = match.node.data.slice(match.start + match.length);
    return prefixPattern.test(before) && suffixPattern.test(after);
  });
  return supported.length === 1 && supported[0]?.visible ? supported[0] : null;
}

function resolveDocument(
  source: Document | HTMLIFrameElement,
): Document | null {
  return source.nodeType === source.DOCUMENT_NODE
    ? (source as Document)
    : (source as HTMLIFrameElement).contentDocument;
}

function collectMatches(
  document: Document,
  needle: string,
): Array<PreviewTextMatch & { visible: boolean }> | null {
  const root = document.body ?? document.documentElement;
  if (!root) return [];
  const nodeFilter = document.defaultView?.NodeFilter ?? NodeFilter;
  const walker = document.createTreeWalker(root, nodeFilter.SHOW_TEXT);
  const pattern = new RegExp(escapeRegex(needle), "giu");
  const matches: Array<PreviewTextMatch & { visible: boolean }> = [];
  let textNodeCount = 0;
  let textLength = 0;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    textNodeCount += 1;
    textLength += text.data.length;
    if (textNodeCount > MAX_TEXT_NODES || textLength > MAX_TEXT_LENGTH) {
      return null;
    }
    const container = text.parentElement;
    if (!container) continue;
    for (const match of text.data.matchAll(pattern)) {
      if (match.index === undefined) continue;
      matches.push({
        node: text,
        start: match.index,
        length: match[0].length,
        container,
        visible: isVisible(container, document),
      });
      if (matches.length > MAX_MATCHES) return null;
    }
  }
  return matches;
}

function isVisible(element: Element, document: Document): boolean {
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      EXCLUDED_ELEMENTS.has(current.tagName) ||
      current.hasAttribute("hidden") ||
      current.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
    const style = document.defaultView?.getComputedStyle(current);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse" ||
      style?.opacity === "0"
    ) {
      return false;
    }
  }
  return true;
}

function contextPattern(hint: string, position: "prefix" | "suffix"): RegExp {
  const boundary = position === "prefix" ? "$" : "^";
  const source =
    position === "prefix"
      ? `${escapeRegex(hint)}${boundary}`
      : `${boundary}${escapeRegex(hint)}`;
  return new RegExp(source, "iu");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
