import { REVIEW_LIMITS, type TextAnchor } from "../shared/review.js";
import { locatePassage } from "../shared/review-match.js";

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
 * 文書が変わった後に、コメントした文章を探し直す。
 * @param document - プレビューの文書
 * @param anchor - 記録した anchor
 * @returns 文章の範囲。同じ文章と判断できる箇所がなければ null
 * @throws しない
 */
export function locateTextAnchor(
  document: Document,
  anchor: TextAnchor,
): Range | null {
  const index = indexText(document);
  // 照合は空白を除いた文字で行うため、見つけた位置を元の文字の位置へ戻す表を作る
  const positions: number[] = [];
  let compact = "";
  for (let at = 0; at < index.text.length; at += 1) {
    const character = index.text[at] as string;
    if (/\s/.test(character)) continue;
    positions.push(at);
    compact += character;
  }
  const match = locatePassage(compact, anchor);
  if (!match) return null;
  const start = positions[match.start];
  const last = positions[match.end - 1];
  if (start === undefined || last === undefined) return null;
  const startPoint = pointAt(index, start, false);
  const endPoint = pointAt(index, last + 1, true);
  if (!startPoint || !endPoint) return null;
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

/** Elements that can be commented on as a whole by hovering them. */
export const COMMENTABLE_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, tr, pre";

/**
 * Covers the visible text of a block, cut to the longest text an anchor may hold.
 * @param document - Previewed document
 * @param element - Paragraph, list item, heading, table row, or code block
 * @returns Range over the block's text, or null when it has none
 * @throws Never
 */
export function blockRange(document: Document, element: Element): Range | null {
  const range = document.createRange();
  range.selectNodeContents(element);
  let remaining = REVIEW_LIMITS.anchorTextLength;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (length >= remaining) {
      range.setEnd(node, remaining);
      break;
    }
    remaining -= length;
  }
  return range.toString().trim() ? range : null;
}
