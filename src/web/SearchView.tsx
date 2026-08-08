import { useEffect, useLayoutEffect, useRef } from "react";
import {
  SEARCH_QUERY_MAX_LENGTH,
  type SearchResponse,
} from "../shared/search.js";
import { Icon } from "./icons.js";
import { SearchContent } from "./SearchContent.js";
import type { SearchResultLocator } from "./search-navigation-url.js";

interface SearchViewProps {
  isActive: boolean;
  query: string;
  result: SearchResponse | null;
  phase: "idle" | "initial" | "updating" | "error";
  collapsedEntryIds: ReadonlySet<string>;
  scrollTop: number;
  isFilePanelVisible: boolean;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onRetry: () => void;
  onToggleEntry: (entryId: string) => void;
  onSelect: (entryId: string, locator: SearchResultLocator | null) => void;
  onScroll: (scrollTop: number) => void;
  onToggleFilePanel: () => void;
}

export function SearchView({
  isActive,
  query,
  result,
  phase,
  collapsedEntryIds,
  scrollTop,
  isFilePanelVisible,
  onQueryChange,
  onClose,
  onRetry,
  onToggleEntry,
  onSelect,
  onScroll,
  onToggleFilePanel,
}: SearchViewProps) {
  const resultsRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (resultsRef.current) {
      resultsRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop]);
  useEffect(() => {
    if (isActive) {
      inputRef.current?.focus();
    }
  }, [isActive]);
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isActive, onClose]);

  return (
    <section className="viewer search-view" hidden={!isActive}>
      <span
        className="visually-hidden"
        role="status"
        aria-label="Search status"
        aria-live={isActive ? "polite" : "off"}
        aria-atomic="true"
      >
        {formatLiveStatus(isActive, phase, result)}
      </span>
      <header className="search-header">
        <button
          className="file-panel-toggle"
          data-status-description={
            isFilePanelVisible ? "Hide the file panel." : "Show the file panel."
          }
          type="button"
          aria-label={
            isFilePanelVisible ? "Hide file panel" : "Show file panel"
          }
          onClick={onToggleFilePanel}
        >
          {isFilePanelVisible ? (
            <Icon name="terminal" size={14} />
          ) : (
            <span aria-hidden="true">›</span>
          )}
        </button>
        <label className="search-input-wrap">
          <span className="visually-hidden">Search HTML files</span>
          <span className="search-glyph" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            data-status-description="Enter text to search every HTML file."
            aria-label="Search HTML files"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            value={query}
            placeholder="Search HTML files"
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {phase === "updating" && (
            <span
              className="search-spinner"
              role="status"
              aria-label="Updating search results"
            />
          )}
        </label>
        <span className="search-total">
          {result ? formatResultSummary(result) : ""}
        </span>
        <button
          className="search-close"
          data-status-description="Close the search view."
          type="button"
          aria-label="Close search"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <section
        ref={resultsRef}
        className="search-body"
        aria-label="Search results"
        onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
      >
        {result?.truncated && phase !== "error" && (
          <p className="search-limit-message">
            Results are limited. More matches may exist.
          </p>
        )}
        <SearchContent
          query={query}
          result={result}
          phase={phase}
          collapsedEntryIds={collapsedEntryIds}
          onRetry={onRetry}
          onToggleEntry={onToggleEntry}
          onSelect={onSelect}
        />
      </section>
    </section>
  );
}

function formatMatchCount(count: number): string {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

function formatResultSummary(result: SearchResponse): string {
  const fileCount = result.files.length;
  return `${formatMatchCount(result.totalMatches)} in ${fileCount} ${
    fileCount === 1 ? "file" : "files"
  }`;
}

function formatLiveStatus(
  isActive: boolean,
  phase: SearchViewProps["phase"],
  result: SearchResponse | null,
): string {
  if (!isActive) return "";
  if (phase === "initial") return "Searching HTML files.";
  if (phase === "updating") return "Updating search results.";
  if (phase === "error") return "Search failed.";
  if (result?.totalMatches === 0) return "No matches found.";
  return result ? `${formatResultSummary(result)}.` : "";
}
