import { findPreviewSearchMatch } from "./preview-search-matches.js";

/**
 * プレビュー内の検索対象と、検索結果から得た表示文脈を表す。
 */
export interface PreviewSearchTargetOptions {
  source: Document | HTMLIFrameElement;
  query: string;
  matchText?: string;
  ordinalHint?: number;
  prefixHint?: string;
  suffixHint?: string;
}

/**
 * 表示文脈で一意に特定できるテキストを選択し、中央へ移動する。
 *
 * @param options - プレビューと検索結果の位置情報
 * @returns 対象を安全に選択できたか
 */
export function revealPreviewSearchTarget(
  options: PreviewSearchTargetOptions,
): boolean {
  try {
    const located = findPreviewSearchMatch(options);
    if (!located) return false;
    const selection = located.document.getSelection();
    if (!selection) return false;
    const range = createRange(located.document, located.match);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      located.match.container.scrollIntoView({ block: "center" });
    } catch {
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 現在の選択が指定した検索対象と一致する場合に限り解除する。
 *
 * @param options - 解除対象を特定する位置情報
 * @returns 検索による選択を解除したか
 */
export function clearPreviewSearchTarget(
  options: PreviewSearchTargetOptions,
): boolean {
  try {
    const located = findPreviewSearchMatch(options);
    const selection = located?.document.getSelection();
    if (!located || !selection || selection.rangeCount !== 1) return false;
    const selectedRange = selection.getRangeAt(0);
    const targetRange = createRange(located.document, located.match);
    if (!sameRange(selectedRange, targetRange)) return false;
    selection.removeAllRanges();
    return true;
  } catch {
    return false;
  }
}

function createRange(
  document: Document,
  match: { node: Text; start: number; length: number },
): Range {
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.start + match.length);
  return range;
}

function sameRange(left: Range, right: Range): boolean {
  return (
    left.startContainer === right.startContainer &&
    left.startOffset === right.startOffset &&
    left.endContainer === right.endContainer &&
    left.endOffset === right.endOffset
  );
}
