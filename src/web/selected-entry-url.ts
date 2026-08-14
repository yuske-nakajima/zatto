import { activateMainView, NAVIGATION_PARAMETERS } from "./main-view-url.js";

export function readSelectedEntryIdFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get(
      NAVIGATION_PARAMETERS.entry,
    );
  } catch {
    return null;
  }
}

export function replaceSelectedEntryIdInUrl(
  selectedEntryId: string | null,
): void {
  writeSelectedEntryIdInUrl(selectedEntryId, "replace", false);
}

export function pushSelectedEntryIdInUrl(selectedEntryId: string): void {
  writeSelectedEntryIdInUrl(selectedEntryId, "push", true);
}

function writeSelectedEntryIdInUrl(
  selectedEntryId: string | null,
  mode: "push" | "replace",
  exitsSearch: boolean,
): void {
  try {
    const url = new URL(window.location.href);
    const currentEntryId = url.searchParams.get(NAVIGATION_PARAMETERS.entry);
    if (
      currentEntryId === selectedEntryId &&
      (!exitsSearch ||
        (!url.searchParams.has(NAVIGATION_PARAMETERS.searchView) &&
          !url.searchParams.has(NAVIGATION_PARAMETERS.match) &&
          !url.searchParams.has(NAVIGATION_PARAMETERS.matchText) &&
          !url.searchParams.has(NAVIGATION_PARAMETERS.doc))) &&
      (selectedEntryId !== null ||
        !url.searchParams.has(NAVIGATION_PARAMETERS.entry))
    ) {
      return;
    }

    if (selectedEntryId) {
      url.searchParams.set(NAVIGATION_PARAMETERS.entry, selectedEntryId);
    } else {
      url.searchParams.delete(NAVIGATION_PARAMETERS.entry);
    }
    if (exitsSearch) {
      activateMainView(url, "preview");
    }
    if (exitsSearch || currentEntryId !== selectedEntryId) {
      url.searchParams.delete(NAVIGATION_PARAMETERS.match);
      url.searchParams.delete(NAVIGATION_PARAMETERS.matchText);
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (mode === "push") {
      window.history.pushState(window.history.state, "", nextUrl);
    } else {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  } catch {
    return;
  }
}
