import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";
import { truncateUnicode } from "../shared/text.js";
import type { SearchResultLocator } from "./search-navigation-url.js";

const CONTEXT_LENGTH = 40;

export interface SearchHistorySnapshot {
  scrollTop: number;
  collapsedEntryIds: string[];
  previewTarget: SearchResultLocator | null;
}

export function readSearchHistorySnapshot(): SearchHistorySnapshot {
  const state = window.history.state;
  if (!isRecord(state) || !isRecord(state.zattoSearch)) {
    return { scrollTop: 0, collapsedEntryIds: [], previewTarget: null };
  }
  const scrollTop = state.zattoSearch.scrollTop;
  const collapsedEntryIds = state.zattoSearch.collapsedEntryIds;
  return {
    scrollTop:
      typeof scrollTop === "number" && Number.isFinite(scrollTop)
        ? Math.max(0, scrollTop)
        : 0,
    collapsedEntryIds: Array.isArray(collapsedEntryIds)
      ? collapsedEntryIds.filter(
          (entryId): entryId is string => typeof entryId === "string",
        )
      : [],
    previewTarget: readPreviewTarget(state.zattoSearch.previewTarget),
  };
}

function readPreviewTarget(value: unknown): SearchResultLocator | null {
  if (!isRecord(value)) {
    return null;
  }
  const { entryId, lineNumber, offset, length, ordinal } = value;
  if (
    typeof entryId !== "string" ||
    entryId.length === 0 ||
    !isIntegerAtLeast(lineNumber, 1) ||
    !isIntegerAtLeast(offset, 0) ||
    !isIntegerAtLeast(length, 1) ||
    !isIntegerAtLeast(ordinal, 0)
  ) {
    return null;
  }
  return {
    entryId,
    lineNumber,
    offset,
    length,
    ordinal,
    matchText: readOptionalString(value.matchText, SEARCH_QUERY_MAX_LENGTH),
    prefix: readOptionalString(value.prefix, CONTEXT_LENGTH, "end", true),
    suffix: readOptionalString(value.suffix, CONTEXT_LENGTH, "start", true),
  };
}

function readOptionalString(
  value: unknown,
  maxLength: number,
  edge: "start" | "end" = "start",
  allowEmpty = false,
): string | null {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    return null;
  }
  return truncateUnicode(value, maxLength, edge);
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

export function replaceSearchHistorySnapshot(
  snapshot: SearchHistorySnapshot,
): void {
  try {
    const state = isRecord(window.history.state)
      ? { ...window.history.state }
      : {};
    window.history.replaceState(
      { ...state, zattoSearch: snapshot },
      "",
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
  } catch {
    return;
  }
}

/**
 * 高頻度の履歴更新をanimation frame単位にまとめるwriterを生成する。
 *
 * @returns 遅延保存、即時保存、flushを提供するwriter
 */
export function createSearchHistoryWriter() {
  let pendingSnapshot: SearchHistorySnapshot | null = null;
  let frameId: number | null = null;

  function flush(): void {
    if (!pendingSnapshot) return;
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    frameId = null;
    replaceSearchHistorySnapshot(snapshot);
  }

  function schedule(snapshot: SearchHistorySnapshot): void {
    pendingSnapshot = snapshot;
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      const nextSnapshot = pendingSnapshot;
      pendingSnapshot = null;
      if (nextSnapshot) replaceSearchHistorySnapshot(nextSnapshot);
    });
  }

  function replace(snapshot: SearchHistorySnapshot): void {
    pendingSnapshot = snapshot;
    flush();
  }

  function cancel(): void {
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    pendingSnapshot = null;
    frameId = null;
  }

  return { schedule, replace, flush, cancel };
}

/**
 * URL の検索位置へ、同一位置の履歴状態に保存した表示文脈を補う。
 *
 * @param locator - URL から復元した検索位置
 * @param contextualLocator - 履歴状態から復元した検索位置と表示文脈
 * @returns 表示文脈を補った検索位置。不一致の場合は URL の検索位置
 */
export function mergeSearchHistoryLocator(
  locator: SearchResultLocator | null,
  contextualLocator: SearchResultLocator | null,
): SearchResultLocator | null {
  if (
    !locator ||
    !contextualLocator ||
    !sameLocator(locator, contextualLocator)
  ) {
    return locator;
  }
  return {
    ...locator,
    prefix: contextualLocator.prefix,
    suffix: contextualLocator.suffix,
  };
}

function sameLocator(
  left: SearchResultLocator,
  right: SearchResultLocator,
): boolean {
  return (
    left.entryId === right.entryId &&
    left.lineNumber === right.lineNumber &&
    left.offset === right.offset &&
    left.length === right.length &&
    left.ordinal === right.ordinal &&
    left.matchText === right.matchText
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
