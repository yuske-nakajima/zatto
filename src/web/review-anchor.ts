import { REVIEW_LIMITS, type TextAnchor } from "../shared/review.js";

const EXCLUDED_ELEMENTS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

interface TextIndex {
  text: string;
  nodes: Array<{ node: Text; start: number }>;
}

/**
 * Concatenates the visible text of a document body, remembering where each text node starts.
 * Script and style contents are skipped because readers never see them.
 */
function indexText(document: Document): TextIndex {
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  const root = document.body ?? document.documentElement;
  const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent) {
        // SVG 内の要素名は小文字（style など）で返る
        if (EXCLUDED_ELEMENTS.has(parent.tagName.toUpperCase())) return 2; // FILTER_REJECT
        parent = parent.parentElement;
      }
      return 1; // FILTER_ACCEPT
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += (node as Text).data;
  }
  return { text, nodes };
}

function offsetOf(index: TextIndex, node: Node, offset: number): number | null {
  if (node.nodeType === 3) {
    const found = index.nodes.find((item) => item.node === node);
    return found ? found.start + offset : null;
  }
  // 要素の境界は、その位置より後ろにある最初のテキストの先頭として扱う
  const boundary = node.ownerDocument?.createRange();
  if (!boundary) return null;
  boundary.setStart(node, offset);
  const next = index.nodes.find(
    (item) => boundary.comparePoint(item.node, 0) >= 0,
  );
  return next ? next.start : index.text.length;
}

function pointAt(index: TextIndex, offset: number, end: boolean) {
  for (let i = index.nodes.length - 1; i >= 0; i -= 1) {
    const item = index.nodes[i];
    if (
      item &&
      (end ? offset > item.start : offset >= item.start) &&
      offset <= item.start + item.node.data.length
    )
      return { node: item.node, offset: offset - item.start };
  }
  return null;
}

/**
 * Records a selection as its text and surrounding context.
 * @param document - Previewed document
 * @param range - Non-empty selection inside the document
 * @returns Anchor, or null when the selection has no visible text
 * @throws Never
 */
export function createTextAnchor(
  document: Document,
  range: Range,
): TextAnchor | null {
  const index = indexText(document);
  const start = offsetOf(index, range.startContainer, range.startOffset);
  const end = offsetOf(index, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  const exact = index.text.slice(start, end);
  if (!exact.trim() || exact.length > REVIEW_LIMITS.anchorTextLength)
    return null;
  const context = REVIEW_LIMITS.contextLength;
  return {
    exact,
    prefix: index.text.slice(Math.max(0, start - context), start),
    suffix: index.text.slice(end, end + context),
  };
}

/**
 * Finds the anchored text again, preferring the occurrence whose surroundings match best.
 * @param document - Previewed document
 * @param anchor - Recorded anchor
 * @returns Range covering the text, or null when it no longer exists
 * @throws Never
 */
export function locateTextAnchor(
  document: Document,
  anchor: TextAnchor,
): Range | null {
  const index = indexText(document);
  let best: { start: number; score: number } | null = null;
  for (
    let start = index.text.indexOf(anchor.exact);
    start !== -1;
    start = index.text.indexOf(anchor.exact, start + 1)
  ) {
    const score =
      commonSuffix(index.text.slice(0, start), anchor.prefix) +
      commonPrefix(
        index.text.slice(start + anchor.exact.length),
        anchor.suffix,
      );
    if (!best || score > best.score) best = { start, score };
  }
  if (!best) return null;
  const startPoint = pointAt(index, best.start, false);
  const endPoint = pointAt(index, best.start + anchor.exact.length, true);
  if (!startPoint || !endPoint) return null;
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

function commonSuffix(text: string, expected: string): number {
  let count = 0;
  while (
    count < expected.length &&
    count < text.length &&
    text[text.length - 1 - count] === expected[expected.length - 1 - count]
  )
    count += 1;
  return count;
}

function commonPrefix(text: string, expected: string): number {
  let count = 0;
  while (
    count < expected.length &&
    count < text.length &&
    text[count] === expected[count]
  )
    count += 1;
  return count;
}
