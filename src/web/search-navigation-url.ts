import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";
import { truncateUnicode } from "../shared/text.js";

const SEARCH_PARAMETER = "search";
const SEARCH_VIEW_PARAMETER = "searchView";
const MATCH_PARAMETER = "match";
const MATCH_TEXT_PARAMETER = "matchText";

export interface SearchResultLocator {
  entryId: string;
  lineNumber: number;
  offset: number;
  length: number;
  ordinal: number;
  matchText: string | null;
  prefix: string | null;
  suffix: string | null;
}

export interface SearchLocation {
  query: string;
  isSearchVisible: boolean;
  locator: SearchResultLocator | null;
}

export function readSearchLocation(): SearchLocation {
  try {
    const url = new URL(window.location.href);
    const query = truncateUnicode(
      url.searchParams.get(SEARCH_PARAMETER) ?? "",
      SEARCH_QUERY_MAX_LENGTH,
    );
    const isSearchVisible = url.searchParams.get(SEARCH_VIEW_PARAMETER) === "1";
    return {
      query,
      isSearchVisible,
      locator: isSearchVisible ? null : readLocator(url, query),
    };
  } catch {
    return { query: "", isSearchVisible: false, locator: null };
  }
}

export function replaceSearchLocation(location: SearchLocation): void {
  writeSearchLocation(location, "replace");
}

export function pushSearchLocation(
  location: SearchLocation,
  entryId?: string | null,
): void {
  writeSearchLocation(location, "push", entryId);
}

function writeSearchLocation(
  location: SearchLocation,
  mode: "push" | "replace",
  entryId?: string | null,
): void {
  try {
    const url = new URL(window.location.href);
    const query = truncateUnicode(location.query, SEARCH_QUERY_MAX_LENGTH);
    setOptionalParameter(url, SEARCH_PARAMETER, query || null);
    setOptionalParameter(
      url,
      SEARCH_VIEW_PARAMETER,
      location.isSearchVisible ? "1" : null,
    );
    if (entryId !== undefined) {
      setOptionalParameter(url, "entry", entryId);
    }
    writeLocator(url, { ...location, query });
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (mode === "replace" && nextUrl === currentRelativeUrl()) {
      return;
    }
    window.history[`${mode}State`](window.history.state, "", nextUrl);
  } catch {
    return;
  }
}

function readLocator(url: URL, query: string): SearchResultLocator | null {
  const parts = url.searchParams.get(MATCH_PARAMETER)?.split(".") ?? [];
  if (
    parts.length !== 4 ||
    query.length === 0 ||
    !url.searchParams.has("entry")
  ) {
    return null;
  }
  const [lineNumber, offset, length, ordinal] = parts.map(Number);
  if (
    !Number.isInteger(lineNumber) ||
    lineNumber < 1 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(length) ||
    length < 1 ||
    !Number.isInteger(ordinal) ||
    ordinal < 0
  ) {
    return null;
  }
  const matchText = url.searchParams.get(MATCH_TEXT_PARAMETER);
  return {
    entryId: url.searchParams.get("entry") ?? "",
    lineNumber,
    offset,
    length,
    ordinal,
    matchText:
      matchText && matchText !== query
        ? truncateUnicode(matchText, SEARCH_QUERY_MAX_LENGTH)
        : null,
    prefix: null,
    suffix: null,
  };
}

function writeLocator(url: URL, location: SearchLocation): void {
  const locator = location.locator;
  if (location.isSearchVisible || !locator || location.query.length === 0) {
    url.searchParams.delete(MATCH_PARAMETER);
    url.searchParams.delete(MATCH_TEXT_PARAMETER);
    return;
  }
  url.searchParams.set(
    MATCH_PARAMETER,
    [locator.lineNumber, locator.offset, locator.length, locator.ordinal].join(
      ".",
    ),
  );
  const matchText = locator.matchText
    ? truncateUnicode(locator.matchText, SEARCH_QUERY_MAX_LENGTH)
    : null;
  setOptionalParameter(
    url,
    MATCH_TEXT_PARAMETER,
    matchText && matchText !== location.query ? matchText : null,
  );
}

function setOptionalParameter(
  url: URL,
  name: string,
  value: string | null,
): void {
  if (value === null) {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, value);
  }
}

function currentRelativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
