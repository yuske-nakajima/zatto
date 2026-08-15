import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";
import { truncateUnicode } from "../shared/text.js";
import { activateMainView, NAVIGATION_PARAMETERS } from "./main-view-url.js";

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

/**
 * Creates a search location value for history navigation.
 *
 * @param query - Current search query
 * @param isSearchVisible - Whether the search workspace is visible
 * @param locator - Selected search result location
 * @returns Search location with the supplied values
 */
export function createSearchLocation(
  query: string,
  isSearchVisible: boolean,
  locator: SearchResultLocator | null,
): SearchLocation {
  return { query, isSearchVisible, locator };
}

export function readSearchLocation(): SearchLocation {
  try {
    const url = new URL(window.location.href);
    const query = truncateUnicode(
      url.searchParams.get(NAVIGATION_PARAMETERS.search) ?? "",
      SEARCH_QUERY_MAX_LENGTH,
    );
    const isSearchVisible =
      !url.searchParams.has(NAVIGATION_PARAMETERS.doc) &&
      url.searchParams.get(NAVIGATION_PARAMETERS.searchView) === "1";
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
    if (mode === "push") {
      activateMainView(url, location.isSearchVisible ? "search" : "preview");
    }
    const query = truncateUnicode(location.query, SEARCH_QUERY_MAX_LENGTH);
    setOptionalParameter(url, NAVIGATION_PARAMETERS.search, query || null);
    setOptionalParameter(
      url,
      NAVIGATION_PARAMETERS.searchView,
      location.isSearchVisible ? "1" : null,
    );
    if (entryId !== undefined) {
      setOptionalParameter(url, NAVIGATION_PARAMETERS.entry, entryId);
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
  const parts =
    url.searchParams.get(NAVIGATION_PARAMETERS.match)?.split(".") ?? [];
  if (
    parts.length !== 4 ||
    query.length === 0 ||
    !url.searchParams.has(NAVIGATION_PARAMETERS.entry)
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
  const matchText = url.searchParams.get(NAVIGATION_PARAMETERS.matchText);
  return {
    entryId: url.searchParams.get(NAVIGATION_PARAMETERS.entry) ?? "",
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
    url.searchParams.delete(NAVIGATION_PARAMETERS.match);
    url.searchParams.delete(NAVIGATION_PARAMETERS.matchText);
    return;
  }
  url.searchParams.set(
    NAVIGATION_PARAMETERS.match,
    [locator.lineNumber, locator.offset, locator.length, locator.ordinal].join(
      ".",
    ),
  );
  const matchText = locator.matchText
    ? truncateUnicode(locator.matchText, SEARCH_QUERY_MAX_LENGTH)
    : null;
  setOptionalParameter(
    url,
    NAVIGATION_PARAMETERS.matchText,
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
