import { type DragEvent, useRef, useState } from "react";
import { AppViewer } from "./AppViewer.js";
import type { CopyFeedback } from "./copy-feedback.js";
import { prepareEntryDrag } from "./entry-drag.js";
import { FilePanel } from "./FilePanel.js";
import { moveEntry } from "./file-panel-model.js";
import { createFolderSessionRemover } from "./folder-session-removal.js";
import { ResizableLayout } from "./ResizableLayout.js";
import { StatusBarFrame } from "./StatusBarFrame.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import { requestSessionChange } from "./session-change.js";
import { useFilePanelNavigation } from "./useFilePanelNavigation.js";
import { useNativeFilePicker } from "./useNativeFilePicker.js";
import { useSearchNavigation } from "./useSearchNavigation.js";
import { useSessionEntries } from "./useSessionEntries.js";
import { useSessionTransfer } from "./useSessionTransfer.js";

export { buildDirectoryTree } from "./directory-tree-model.js";
export { moveEntry, selectAvailableEntry } from "./file-panel-model.js";
export function App() {
  const copyRequestId = useRef(0);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const {
    entries,
    setEntries,
    selectedId,
    selectEntry: selectSessionEntry,
    reloadVersion,
    searchVersion,
    errorMessage,
    setErrorMessage,
    filePicker,
    serverInstanceId,
    isLoaded: isSessionLoaded,
    applyImportedEntries,
  } = useSessionEntries(() => {
    copyRequestId.current += 1;
    setCopyFeedback(null);
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const filePickerControl = useNativeFilePicker({
    capability: filePicker,
    selectEntry,
    setErrorMessage,
  });
  const search = useSearchNavigation(searchVersion);
  const filePanel = useFilePanelNavigation(search.flushHistory);
  const sessionTransfer = useSessionTransfer({
    instanceId: serverInstanceId,
    applyImportedEntries,
    resetSearch: search.reset,
    setErrorMessage,
  });
  const selectedEntry = entries.find(({ id }) => id === selectedId) ?? null;
  function selectEntry(id: string): void {
    copyRequestId.current += 1;
    setCopyFeedback(null);
    search.flushHistory();
    selectSessionEntry(id);
    search.showPreview();
  }
  function selectSearchResult(
    id: string,
    locator: SearchResultLocator | null,
  ): void {
    if (!entries.some((entry) => entry.id === id)) return;
    if (!locator) {
      selectEntry(id);
      return;
    }
    copyRequestId.current += 1;
    selectSessionEntry(id, "none");
    setCopyFeedback(null);
    search.openResult(id, locator);
  }
  async function copyPath(path: string): Promise<void> {
    const requestId = copyRequestId.current + 1;
    copyRequestId.current = requestId;
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(path);
      if (copyRequestId.current === requestId) {
        setCopyFeedback({ kind: "success", message: "Path copied!" });
      }
    } catch {
      if (copyRequestId.current === requestId) {
        setCopyFeedback({
          kind: "error",
          message: "Could not copy the path.",
        });
      }
    }
  }
  async function removeEntry(id: string): Promise<void> {
    const removed = await requestSessionChange(
      `/api/session/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!removed) {
      setErrorMessage("Could not remove the entry.");
    }
  }
  async function clearEntries(): Promise<void> {
    if (entries.length === 0 || !window.confirm("Remove all entries?")) {
      return;
    }
    const cleared = await requestSessionChange("/api/session", {
      method: "DELETE",
    });
    if (!cleared) {
      setErrorMessage("Could not remove all entries.");
    }
  }
  async function reorderEntries(targetId: string): Promise<void> {
    if (!draggedId || draggedId === targetId) {
      resetDragState();
      return;
    }
    const previousEntries = entries;
    const reorderedEntries = moveEntry(entries, draggedId, targetId);
    setEntries(reorderedEntries);
    resetDragState();
    const reordered = await requestSessionChange("/api/session/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: reorderedEntries.map((entry) => entry.id) }),
    });
    if (!reordered) {
      setEntries(previousEntries);
      setErrorMessage("Could not reorder the entries.");
    }
  }
  function resetDragState(): void {
    setDraggedId(null);
    setDropTargetId(null);
  }
  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    id: string,
  ): void {
    prepareEntryDrag(event, id);
    setDraggedId(id);
  }
  return (
    <StatusBarFrame>
      <ResizableLayout
        isFilePanelVisible={filePanel.isVisible}
        filePanel={
          filePanel.isVisible ? (
            <FilePanel
              entries={entries}
              selectedId={selectedId}
              view={filePanel.view}
              draggedId={draggedId}
              dropTargetId={dropTargetId}
              canPickFiles={filePicker.available}
              isFilePickerOpen={filePickerControl.isOpen}
              sessionTransferPending={sessionTransfer.pending}
              isSessionLoaded={isSessionLoaded}
              isSearchVisible={search.isVisible}
              hasSearchState={search.hasState}
              searchButtonRef={search.triggerRef}
              onViewChange={filePanel.setView}
              onClear={clearEntries}
              onSelect={selectEntry}
              onCopyPath={copyPath}
              onRemove={removeEntry}
              onRemoveEntries={createFolderSessionRemover(setErrorMessage)}
              onDragStart={handleDragStart}
              onDragEnter={setDropTargetId}
              onDragEnd={resetDragState}
              onDrop={reorderEntries}
              onPickFiles={filePickerControl.open}
              onOpenSearch={search.open}
              onImportSession={sessionTransfer.importFile}
              onExportSession={sessionTransfer.exportFile}
            />
          ) : null
        }
        viewer={
          <AppViewer
            search={search}
            selectedEntry={selectedEntry}
            reloadVersion={reloadVersion}
            isFilePanelVisible={filePanel.isVisible}
            errorMessage={errorMessage}
            copyFeedback={copyFeedback}
            canPickFiles={filePicker.available}
            isFilePickerOpen={filePickerControl.isOpen}
            onSelect={selectSearchResult}
            onToggleFilePanel={filePanel.toggleVisibility}
            onCopyPath={copyPath}
            onPickFiles={filePickerControl.open}
          />
        }
      />
    </StatusBarFrame>
  );
}
