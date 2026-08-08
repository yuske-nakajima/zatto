import type {
  SearchFileResult,
  SearchLineMatch,
  SearchResponse,
} from "../shared/search.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import { createSearchResultLocator } from "./search-result-locator.js";

interface SearchResultsProps {
  result: SearchResponse;
  collapsedEntryIds: ReadonlySet<string>;
  onToggleEntry: (entryId: string) => void;
  onSelect: (entryId: string, locator: SearchResultLocator | null) => void;
}

export function SearchResults({
  result,
  collapsedEntryIds,
  onToggleEntry,
  onSelect,
}: SearchResultsProps) {
  return (
    <div className="search-result-groups">
      {result.files.map((file) => (
        <SearchResultGroup
          key={file.entryId}
          file={file}
          query={result.query}
          isCollapsed={collapsedEntryIds.has(file.entryId)}
          onToggle={() => onToggleEntry(file.entryId)}
          onSelect={(locator) => onSelect(file.entryId, locator)}
        />
      ))}
    </div>
  );
}

interface SearchResultGroupProps {
  file: SearchFileResult;
  query: string;
  isCollapsed: boolean;
  onToggle: () => void;
  onSelect: (locator: SearchResultLocator | null) => void;
}

function SearchResultGroup({
  file,
  query,
  isCollapsed,
  onToggle,
  onSelect,
}: SearchResultGroupProps) {
  let visibleOrdinal = 0;
  return (
    <section className="search-result-group">
      <button
        className="search-result-file"
        type="button"
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${file.fileName}`}
        onClick={onToggle}
      >
        <span className="search-result-chevron" aria-hidden="true">
          {isCollapsed ? "›" : "⌄"}
        </span>
        <span className="search-result-file-copy">
          <strong>{file.fileName}</strong>
          <small>{file.absPath}</small>
        </span>
        <span className="search-result-count">
          {file.matchCount} {file.matchCount === 1 ? "match" : "matches"}
        </span>
      </button>
      {!isCollapsed && (
        <ol className="search-match-list">
          {file.lines.map((line) => {
            let locator: SearchResultLocator | null = null;
            for (const [rangeIndex] of line.ranges.entries()) {
              const candidate = createSearchResultLocator(
                file.entryId,
                line,
                visibleOrdinal,
                query,
                rangeIndex,
              );
              if (candidate) {
                if (rangeIndex === 0) locator = candidate;
                visibleOrdinal += 1;
              }
            }
            return (
              <li key={`${line.lineNumber}:${line.startOffset}`}>
                <button
                  type="button"
                  aria-label={`Open ${file.fileName} at line ${line.lineNumber}`}
                  onClick={() => onSelect(locator)}
                >
                  <span className="search-line-number">{line.lineNumber}</span>
                  <code>
                    {line.truncated && <span aria-hidden="true">…</span>}
                    {renderHighlightedLine(line)}
                    {line.truncated && <span aria-hidden="true">…</span>}
                  </code>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function renderHighlightedLine(line: SearchLineMatch) {
  const parts: React.ReactNode[] = [];
  let offset = 0;
  for (const range of line.ranges) {
    parts.push(line.lineText.slice(offset, range.start));
    parts.push(
      <mark key={`${range.start}:${range.length}`}>
        {line.lineText.slice(range.start, range.start + range.length)}
      </mark>,
    );
    offset = range.start + range.length;
  }
  parts.push(line.lineText.slice(offset));
  return parts;
}
