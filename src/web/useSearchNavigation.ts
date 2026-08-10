import { useEffect, useEffectEvent, useRef, useState } from "react";
import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";
import { truncateUnicode } from "../shared/text.js";
import {
  createSearchHistoryWriter,
  mergeSearchHistoryLocator,
  readSearchHistorySnapshot,
} from "./search-history-state.js";
import {
  createSearchLocation,
  pushSearchLocation,
  readSearchLocation,
  replaceSearchLocation,
  type SearchResultLocator,
} from "./search-navigation-url.js";
import { useEntrySearch } from "./useEntrySearch.js";

export function useSearchNavigation(refreshVersion: number) {
  const [initialLocation] = useState(readSearchLocation);
  const [initialSnapshot] = useState(readSearchHistorySnapshot);
  const initialPreviewTarget = mergeSearchHistoryLocator(
    initialLocation.locator,
    initialSnapshot.previewTarget,
  );
  const search = useEntrySearch(refreshVersion, initialLocation.query);
  const [isVisible, setIsVisible] = useState(initialLocation.isSearchVisible);
  const [previewTarget, setPreviewTarget] = useState(initialPreviewTarget);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const viewerPanelButtonRef = useRef<HTMLButtonElement>(null);
  const wasVisibleRef = useRef(initialLocation.isSearchVisible);
  const [collapsedEntryIds, setCollapsedEntryIds] = useState(
    () => new Set(initialSnapshot.collapsedEntryIds),
  );
  const [scrollTop, setScrollTopState] = useState(initialSnapshot.scrollTop);
  const snapshotRef = useRef({
    ...initialSnapshot,
    previewTarget: initialPreviewTarget,
  });
  const [historyWriter] = useState(createSearchHistoryWriter);
  const sessionGenerationRef = useRef(initialSnapshot.sessionGeneration);
  useEffect(() => replaceSearchLocation(initialLocation), [initialLocation]);
  useEffect(() => {
    if (wasVisibleRef.current && !isVisible) {
      (triggerRef.current ?? viewerPanelButtonRef.current)?.focus();
    }
    wasVisibleRef.current = isVisible;
  }, [isVisible]);
  const restoreFromHistory = useEffectEvent(() => {
    historyWriter.cancel();
    const location = readSearchLocation();
    const snapshot = readSearchHistorySnapshot();
    if (snapshot.sessionGeneration !== sessionGenerationRef.current) {
      clearSearchState();
      replaceSearchLocation(createSearchLocation("", false, null));
      persistSnapshot(0, new Set(), null);
      return;
    }
    search.setQuery(location.query);
    setIsVisible(location.isSearchVisible);
    const restoredPreviewTarget = mergeSearchHistoryLocator(
      location.locator,
      snapshot.previewTarget,
    );
    setPreviewTarget(restoredPreviewTarget);
    setScrollTopState(snapshot.scrollTop);
    setCollapsedEntryIds(new Set(snapshot.collapsedEntryIds));
    snapshotRef.current = {
      ...snapshot,
      previewTarget: restoredPreviewTarget,
    };
    replaceSearchLocation(location);
  });
  useEffect(() => {
    window.addEventListener("popstate", restoreFromHistory);
    return () => {
      window.removeEventListener("popstate", restoreFromHistory);
      historyWriter.flush();
    };
  }, [historyWriter]);
  function setQuery(query: string): void {
    const normalizedQuery = truncateUnicode(query, SEARCH_QUERY_MAX_LENGTH);
    search.setQuery(normalizedQuery);
    setPreviewTarget(null);
    persistPreviewTarget(null);
    replaceSearchLocation({
      query: normalizedQuery,
      isSearchVisible: true,
      locator: null,
    });
  }
  function open(): void {
    if (isVisible) return;
    historyWriter.flush();
    const location = createSearchLocation(search.query, true, null);
    pushSearchLocation(location);
    setPreviewTarget(null);
    persistPreviewTarget(null);
    setIsVisible(true);
  }
  function close(): void {
    historyWriter.flush();
    const location = createSearchLocation(search.query, false, null);
    pushSearchLocation(location);
    setPreviewTarget(null);
    setIsVisible(false);
  }
  function openResult(entryId: string, locator: SearchResultLocator): void {
    historyWriter.flush();
    const location = createSearchLocation(search.query, false, locator);
    pushSearchLocation(location, entryId);
    setPreviewTarget(locator);
    persistPreviewTarget(locator);
    setIsVisible(false);
  }
  function showPreview(): void {
    setPreviewTarget(null);
    setIsVisible(false);
    persistPreviewTarget(null);
  }
  function reset(): void {
    historyWriter.cancel();
    sessionGenerationRef.current += 1;
    clearSearchState();
    persistSnapshot(0, new Set(), null);
    replaceSearchLocation(createSearchLocation("", false, null));
  }
  function clearSearchState(): void {
    search.setQuery("");
    setIsVisible(false);
    setPreviewTarget(null);
    setCollapsedEntryIds(new Set());
    setScrollTopState(0);
  }
  function persistPreviewTarget(target: SearchResultLocator | null): void {
    persistSnapshot(
      snapshotRef.current.scrollTop,
      new Set(snapshotRef.current.collapsedEntryIds),
      target,
    );
  }
  function toggleEntry(entryId: string): void {
    setCollapsedEntryIds((collapsedEntries) => {
      const nextEntries = new Set(collapsedEntries);
      if (nextEntries.has(entryId)) {
        nextEntries.delete(entryId);
      } else {
        nextEntries.add(entryId);
      }
      persistSnapshot(snapshotRef.current.scrollTop, nextEntries);
      return nextEntries;
    });
  }
  function setScrollTop(nextScrollTop: number): void {
    setScrollTopState(nextScrollTop);
    persistSnapshot(
      nextScrollTop,
      new Set(snapshotRef.current.collapsedEntryIds),
      undefined,
      true,
    );
  }
  function persistSnapshot(
    nextScrollTop: number,
    nextCollapsedEntryIds: ReadonlySet<string>,
    nextPreviewTarget = snapshotRef.current.previewTarget,
    deferred = false,
  ): void {
    const snapshot = {
      scrollTop: nextScrollTop,
      collapsedEntryIds: [...nextCollapsedEntryIds],
      previewTarget: nextPreviewTarget,
      sessionGeneration: sessionGenerationRef.current,
    };
    snapshotRef.current = snapshot;
    if (deferred) {
      historyWriter.schedule(snapshot);
    } else {
      historyWriter.replace(snapshot);
    }
  }
  return {
    ...search,
    setQuery,
    isVisible,
    previewTarget,
    triggerRef,
    viewerPanelButtonRef,
    collapsedEntryIds,
    scrollTop,
    open,
    close,
    openResult,
    showPreview,
    reset,
    toggleEntry,
    setScrollTop,
    flushHistory: historyWriter.flush,
  };
}
export type SearchNavigation = ReturnType<typeof useSearchNavigation>;
