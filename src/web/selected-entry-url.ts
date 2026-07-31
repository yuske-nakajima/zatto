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
  try {
    const url = new URL(window.location.href);
    const currentEntryId = url.searchParams.get(SELECTED_ENTRY_PARAMETER);
    if (
      currentEntryId === selectedEntryId &&
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

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    return;
  }
}
