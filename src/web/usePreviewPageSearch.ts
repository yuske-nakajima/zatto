import {
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";
import { truncateUnicode } from "../shared/text.js";
import {
  createPreviewPageHighlights,
  type PreviewPageHighlights,
} from "./preview-page-highlights.js";
import {
  capturePreviewFocus,
  restorePreviewFocus,
} from "./preview-page-search-focus.js";
import { listenForPreviewPageSearch } from "./preview-page-search-listener.js";
import { collectVisiblePreviewMatches } from "./preview-search-matches.js";

interface PreviewPageSearchParameters {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  isHidden: boolean;
  reloadVersion: number;
  selectedEntryId: string | undefined;
  onOpen: () => void;
}

/**
 * プレビューiframe専用のページ内検索状態とライフサイクルを管理する。
 * @param parameters - iframe参照、表示状態、対象ID、開始時処理
 * @returns ページ内検索UIの状態と操作
 */
export function usePreviewPageSearch({
  iframeRef,
  isHidden,
  reloadVersion,
  selectedEntryId,
  onOpen,
}: PreviewPageSearchParameters) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [total, setTotal] = useState(0);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const detachRef = useRef<() => void>(() => {});
  const highlightsRef = useRef<PreviewPageHighlights | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const clearHighlights = useCallback(() => {
    highlightsRef.current?.clear();
    highlightsRef.current = null;
  }, []);
  const detachDocument = useCallback(() => {
    detachRef.current();
    detachRef.current = () => {};
  }, []);
  const resetSearch = useCallback(() => {
    clearHighlights();
    setIsOpen(false);
    setQuery("");
    setCurrentIndex(-1);
    setTotal(0);
    setIsUnavailable(false);
  }, [clearHighlights]);
  const close = useCallback(() => {
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    resetSearch();
    restorePreviewFocus(returnFocus, iframeRef.current);
  }, [iframeRef, resetSearch]);
  const search = useCallback(
    (value: string, targetDocument?: Document) => {
      const normalized = truncateUnicode(value, SEARCH_QUERY_MAX_LENGTH);
      setQuery(normalized);
      clearHighlights();
      setCurrentIndex(-1);
      setTotal(0);
      setIsUnavailable(false);
      if (normalized.length === 0) return;

      try {
        const document = targetDocument ?? iframeRef.current?.contentDocument;
        if (!document) {
          setIsUnavailable(true);
          return;
        }
        const matches = collectVisiblePreviewMatches(document, normalized);
        if (!matches) {
          setIsUnavailable(true);
          return;
        }
        const highlights = createPreviewPageHighlights(document, matches);
        if (!highlights) {
          setIsUnavailable(true);
          return;
        }
        highlightsRef.current = highlights;
        if (highlights.length > 0) {
          if (!highlights.show(0)) {
            clearHighlights();
            setIsUnavailable(true);
            return;
          }
          setCurrentIndex(0);
        }
        setTotal(highlights.length);
      } catch {
        setIsUnavailable(true);
      }
    },
    [clearHighlights, iframeRef],
  );
  const openFromShortcut = useEffectEvent((document: Document) => {
    returnFocusRef.current = capturePreviewFocus(document);
    onOpen();
    setIsOpen(true);
    setFocusVersion((version) => version + 1);
  });
  const restoreSearchAfterLoad = useEffectEvent((document: Document) => {
    if (isOpen && query.length > 0) search(query, document);
  });
  const attachDocument = useCallback(() => {
    detachDocument();
    clearHighlights();
    try {
      const document = iframeRef.current?.contentDocument;
      if (!document) return;
      detachRef.current = listenForPreviewPageSearch(document, () => {
        flushSync(() => openFromShortcut(document));
      });
      restoreSearchAfterLoad(document);
    } catch {
      setIsUnavailable(true);
    }
  }, [clearHighlights, detachDocument, iframeRef]);
  const move = useCallback(
    (step: number) => {
      const highlights = highlightsRef.current;
      if (!highlights || total === 0) return;
      const nextIndex = (currentIndex + step + total) % total;
      if (!highlights.show(nextIndex)) {
        clearHighlights();
        setCurrentIndex(-1);
        setTotal(0);
        setIsUnavailable(true);
        return;
      }
      setCurrentIndex(nextIndex);
    },
    [clearHighlights, currentIndex, total],
  );

  useEffect(() => {
    resetSearch();
    returnFocusRef.current = null;
    detachDocument();
    if (!isHidden && selectedEntryId) attachDocument();
    return () => {
      detachDocument();
      clearHighlights();
    };
  }, [
    attachDocument,
    clearHighlights,
    detachDocument,
    isHidden,
    resetSearch,
    selectedEntryId,
  ]);

  useLayoutEffect(() => {
    void reloadVersion;
    return () => {
      detachDocument();
      clearHighlights();
    };
  }, [clearHighlights, detachDocument, reloadVersion]);

  return {
    isOpen,
    query,
    currentIndex,
    total,
    isUnavailable,
    focusVersion,
    close,
    search,
    previous: () => move(-1),
    next: () => move(1),
    handleFrameLoad: attachDocument,
  };
}
