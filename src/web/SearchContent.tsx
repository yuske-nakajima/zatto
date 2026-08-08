import type { SearchResponse } from "../shared/search.js";
import { SearchResults } from "./SearchResults.js";
import type { SearchResultLocator } from "./search-navigation-url.js";

interface SearchContentProps {
  query: string;
  result: SearchResponse | null;
  phase: "idle" | "initial" | "updating" | "error";
  collapsedEntryIds: ReadonlySet<string>;
  onRetry: () => void;
  onToggleEntry: (entryId: string) => void;
  onSelect: (entryId: string, locator: SearchResultLocator | null) => void;
}

export function SearchContent({
  query,
  result,
  phase,
  collapsedEntryIds,
  onRetry,
  onToggleEntry,
  onSelect,
}: SearchContentProps) {
  if (phase === "error") {
    return (
      <div className="search-state" role="alert">
        <span className="search-error-icon" aria-hidden="true">
          !
        </span>
        <strong>Search failed</strong>
        <p>The HTML files could not be searched.</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (phase === "initial") {
    return <SearchSkeleton />;
  }
  if (query.length === 0) {
    return (
      <SearchMessage
        title="Search HTML files"
        body="Enter text to search the HTML in this session."
      />
    );
  }
  if (result?.totalMatches === 0) {
    return (
      <SearchMessage
        title="No results"
        body={`No matches found for “${query}”.`}
      />
    );
  }
  if (!result) {
    return null;
  }
  return (
    <SearchResults
      result={result}
      collapsedEntryIds={collapsedEntryIds}
      onToggleEntry={onToggleEntry}
      onSelect={onSelect}
    />
  );
}

function SearchSkeleton() {
  return (
    <div
      className="search-skeleton"
      role="status"
      aria-label="Searching HTML files"
    >
      {[0, 1, 2].map((index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function SearchMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="search-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
