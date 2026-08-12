// biome-ignore-all lint/a11y/useSemanticElements: The search element is not consistently exposed to assistive technology.
import { useEffect, useRef } from "react";
import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";

interface PreviewPageSearchProps {
  currentIndex: number;
  focusVersion: number;
  isOpen: boolean;
  isUnavailable: boolean;
  query: string;
  total: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onQueryChange: (query: string) => void;
}

/**
 * プレビュー上にページ内検索操作を表示する。
 *
 * @param props - 検索状態と操作
 * @returns ページ内検索UI。閉じている場合はnull
 */
export function PreviewPageSearch({
  currentIndex,
  focusVersion,
  isOpen,
  isUnavailable,
  query,
  total,
  onClose,
  onNext,
  onPrevious,
  onQueryChange,
}: PreviewPageSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && focusVersion >= 0) inputRef.current?.focus();
  }, [focusVersion, isOpen]);

  if (!isOpen) return null;
  const hasQuery = query.length > 0;
  const hasMatches = total > 0 && !isUnavailable;
  const status = !hasQuery
    ? ""
    : isUnavailable
      ? "Unavailable"
      : total === 0
        ? "0 / 0"
        : `${currentIndex + 1} / ${total}`;

  return (
    <form
      className="preview-page-search"
      role="search"
      aria-label="Find in preview"
      onSubmit={(event) => event.preventDefault()}
    >
      <span className="page-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        data-status-description="Find text in the preview."
        aria-label="Find in preview"
        placeholder="Find in page..."
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          )
            return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrevious();
            else onNext();
          }
        }}
      />
      <span
        className={
          hasQuery && (isUnavailable || total === 0)
            ? "page-search-count page-search-count--empty"
            : "page-search-count"
        }
        role="status"
        aria-label="Page search matches"
      >
        {status}
      </span>
      <span className="page-search-divider" aria-hidden="true" />
      <button
        type="button"
        className="page-search-button"
        data-status-description="Go to the previous preview match."
        aria-label="Previous match"
        disabled={!hasMatches}
        onClick={onPrevious}
      >
        ↑
      </button>
      <button
        type="button"
        className="page-search-button"
        data-status-description="Go to the next preview match."
        aria-label="Next match"
        disabled={!hasMatches}
        onClick={onNext}
      >
        ↓
      </button>
      <span className="page-search-divider" aria-hidden="true" />
      <button
        type="button"
        className="page-search-button"
        data-status-description="Close preview search."
        aria-label="Close page search"
        onClick={onClose}
      >
        ×
      </button>
    </form>
  );
}
