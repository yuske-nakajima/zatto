import type { Entry } from "../server/session.js";

export type FilePanelView = "list" | "directories";

const FILE_PANEL_VIEW_KEY = "zatto:file-panel-view";

export function selectAvailableEntry(
  selectedId: string | null,
  entries: Entry[],
): string | null {
  if (selectedId && entries.some((entry) => entry.id === selectedId)) {
    return selectedId;
  }
  return entries[0]?.id ?? null;
}

export function moveEntry(
  entries: Entry[],
  draggedId: string,
  targetId: string,
): Entry[] {
  const fromIndex = entries.findIndex((entry) => entry.id === draggedId);
  const targetIndex = entries.findIndex((entry) => entry.id === targetId);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
    return entries;
  }

  const reordered = [...entries];
  const [draggedEntry] = reordered.splice(fromIndex, 1);
  reordered.splice(targetIndex, 0, draggedEntry);
  return reordered;
}

export function readFilePanelView(): FilePanelView {
  try {
    return window.localStorage.getItem(FILE_PANEL_VIEW_KEY) === "directories"
      ? "directories"
      : "list";
  } catch {
    return "list";
  }
}

export function storeFilePanelView(filePanelView: FilePanelView): void {
  try {
    window.localStorage.setItem(FILE_PANEL_VIEW_KEY, filePanelView);
  } catch {
    return;
  }
}

export function fileName(absPath: string): string {
  return absPath.split(/[\\/]/).filter(Boolean).at(-1) ?? absPath;
}
