/** Maximum UTF-16 length accepted for a fixed-string search query. */
export const SEARCH_QUERY_MAX_LENGTH = 256;

/** A matched span within the original HTML line. */
export interface SearchMatchRange {
  start: number;
  length: number;
}

/** A source line containing one or more fixed-string matches. */
export interface SearchLineMatch {
  lineNumber: number;
  startOffset: number;
  lineText: string;
  truncated: boolean;
  ranges: SearchMatchRange[];
}

/** Matches grouped under the session entry that owns the HTML file. */
export interface SearchFileResult {
  entryId: string;
  title: string;
  fileName: string;
  absPath: string;
  matchCount: number;
  truncated: boolean;
  lines: SearchLineMatch[];
}

/** Result of searching every HTML entry registered in the session. */
export interface SearchResponse {
  query: string;
  totalMatches: number;
  truncated: boolean;
  files: SearchFileResult[];
}
