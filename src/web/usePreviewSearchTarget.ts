import { useCallback, useEffect, useRef } from "react";
import {
  clearPreviewSearchTarget,
  type PreviewSearchTargetOptions,
  revealPreviewSearchTarget,
} from "./preview-search-target.js";
import type { SearchResultLocator } from "./search-navigation-url.js";

interface PreviewSearchTargetParameters {
  isHidden: boolean;
  previewTarget: SearchResultLocator | null;
  searchQuery: string;
  selectedEntryId: string | undefined;
}

interface RevealedTarget {
  key: string;
  options: PreviewSearchTargetOptions;
}

/**
 * iframe内の検索選択を適用し、検索対象を離れた場合だけ解除する。
 *
 * @param parameters - 現在のプレビューと検索対象
 * @returns iframe参照とload時の適用処理
 */
export function usePreviewSearchTarget({
  isHidden,
  previewTarget,
  searchQuery,
  selectedEntryId,
}: PreviewSearchTargetParameters) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const revealedRef = useRef<RevealedTarget | null>(null);
  const targetKey =
    !isHidden && previewTarget && previewTarget.entryId === selectedEntryId
      ? locatorKey(previewTarget, searchQuery)
      : null;
  const revealTarget = useCallback(() => {
    const frame = iframeRef.current;
    const target = previewTarget;
    if (isHidden || !frame || !target || target.entryId !== selectedEntryId) {
      return false;
    }
    const options: PreviewSearchTargetOptions = {
      source: frame,
      query: searchQuery,
      matchText: target.matchText ?? undefined,
      ordinalHint: target.ordinal,
      prefixHint: target.prefix ?? undefined,
      suffixHint: target.suffix ?? undefined,
    };
    const revealed = revealPreviewSearchTarget(options);
    if (revealed) {
      revealedRef.current = { key: locatorKey(target, searchQuery), options };
    }
    return revealed;
  }, [isHidden, previewTarget, searchQuery, selectedEntryId]);
  const clearRevealedTarget = useCallback(() => {
    const revealed = revealedRef.current;
    if (!revealed) return false;
    const cleared = clearPreviewSearchTarget(revealed.options);
    revealedRef.current = null;
    return cleared;
  }, []);

  useEffect(() => {
    const previous = revealedRef.current;
    if (previous && previous.key !== targetKey) {
      clearPreviewSearchTarget(previous.options);
      revealedRef.current = null;
    }
    revealTarget();
  }, [revealTarget, targetKey]);

  return { iframeRef, revealTarget, clearRevealedTarget };
}

function locatorKey(locator: SearchResultLocator, query: string): string {
  return [
    locator.entryId,
    locator.lineNumber,
    locator.offset,
    locator.length,
    locator.ordinal,
    locator.matchText,
    locator.prefix,
    locator.suffix,
    query,
  ].join(":");
}
