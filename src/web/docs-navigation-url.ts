import { activateMainView, NAVIGATION_PARAMETERS } from "./main-view-url.js";

/** A built-in documentation page exposed by the application. */
export interface DocPage {
  slug: "getting-started" | "cli" | "api" | "gui-api-mapping";
  label: string;
}

/** Language supported by every built-in documentation page. */
export type DocLanguage = "en" | "ja";

/** Documentation state represented by the browser URL. */
export interface DocsLocation {
  page: DocPage;
  language: DocLanguage;
  isVisible: boolean;
}

/** Pages available in the built-in documentation view. */
export const DOC_PAGES: readonly DocPage[] = [
  { slug: "getting-started", label: "Getting started" },
  { slug: "cli", label: "CLI" },
  { slug: "api", label: "API" },
  { slug: "gui-api-mapping", label: "GUI / API mapping" },
];

/**
 * Reads and normalizes documentation state from the current URL.
 *
 * @returns Documentation page, language, and visibility
 */
export function readDocsLocation(): DocsLocation {
  const fallback: DocsLocation = {
    page: DOC_PAGES[0],
    language: "en",
    isVisible: false,
  };
  try {
    const parameters = new URL(window.location.href).searchParams;
    return {
      page:
        DOC_PAGES.find(
          ({ slug }) => slug === parameters.get(NAVIGATION_PARAMETERS.doc),
        ) ?? fallback.page,
      language:
        parameters.get(NAVIGATION_PARAMETERS.language) === "ja" ? "ja" : "en",
      isVisible: parameters.has(NAVIGATION_PARAMETERS.doc),
    };
  } catch {
    return fallback;
  }
}

/**
 * Replaces documentation parameters while preserving unrelated URL state.
 *
 * @param location - Documentation state to write
 * @returns Nothing
 */
export function replaceDocsLocation(location: DocsLocation): void {
  writeDocsLocation(location, "replace");
}

/**
 * Pushes documentation parameters while preserving unrelated URL state.
 *
 * @param location - Documentation state to write
 * @returns Nothing
 */
export function pushDocsLocation(location: DocsLocation): void {
  writeDocsLocation(location, "push");
}

function writeDocsLocation(
  location: DocsLocation,
  mode: "push" | "replace",
): void {
  try {
    const url = new URL(window.location.href);
    setParameter(
      url,
      NAVIGATION_PARAMETERS.doc,
      location.isVisible ? location.page.slug : null,
    );
    setParameter(
      url,
      NAVIGATION_PARAMETERS.language,
      location.language === "ja" ? "ja" : null,
    );
    if (location.isVisible) {
      activateMainView(url, "docs");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (nextUrl === currentUrl()) return;
    window.history[`${mode}State`](window.history.state, "", nextUrl);
  } catch {
    return;
  }
}

function setParameter(url: URL, name: string, value: string | null): void {
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
}

function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
