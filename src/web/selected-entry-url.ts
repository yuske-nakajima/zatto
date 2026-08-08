const SELECTED_ENTRY_PARAMETER = "entry";

export function readSelectedEntryIdFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get(
      SELECTED_ENTRY_PARAMETER,
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
    const currentEntryId = url.searchParams.get(SELECTED_ENTRY_PARAMETER);
    if (
      currentEntryId === selectedEntryId &&
      (!exitsSearch ||
        (!url.searchParams.has("searchView") &&
          !url.searchParams.has("match"))) &&
      (selectedEntryId !== null ||
        !url.searchParams.has(SELECTED_ENTRY_PARAMETER))
    ) {
      return;
    }

    if (selectedEntryId) {
      url.searchParams.set(SELECTED_ENTRY_PARAMETER, selectedEntryId);
    } else {
      url.searchParams.delete(SELECTED_ENTRY_PARAMETER);
    }
    if (exitsSearch) {
      url.searchParams.delete("searchView");
    }
    if (exitsSearch || currentEntryId !== selectedEntryId) {
      url.searchParams.delete("match");
      url.searchParams.delete("matchText");
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
