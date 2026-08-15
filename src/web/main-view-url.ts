/** URL parameter names shared by main-view navigation modules. */
export const NAVIGATION_PARAMETERS = {
  doc: "doc",
  entry: "entry",
  language: "lang",
  match: "match",
  matchText: "matchText",
  search: "search",
  searchView: "searchView",
} as const;

/** Main-area views represented by mutually exclusive URL parameters. */
export type MainView = "preview" | "search" | "docs";

/**
 * Removes URL parameters belonging to main-area views other than the target.
 *
 * @param url - URL to update in place
 * @param view - Main-area view being activated
 * @returns Nothing
 */
export function activateMainView(url: URL, view: MainView): void {
  if (view !== "docs") url.searchParams.delete(NAVIGATION_PARAMETERS.doc);
  if (view !== "search") {
    url.searchParams.delete(NAVIGATION_PARAMETERS.searchView);
  }
  url.searchParams.delete(NAVIGATION_PARAMETERS.match);
  url.searchParams.delete(NAVIGATION_PARAMETERS.matchText);
}
