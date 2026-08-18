import { useRef, useState } from "react";
import { AppViewer } from "./AppViewer.js";
import type { CopyFeedback } from "./copy-feedback.js";
import { FilePanel } from "./FilePanel.js";
import { createFolderSessionRemover } from "./folder-session-removal.js";
import { ResizableLayout } from "./ResizableLayout.js";
import { StatusBarFrame } from "./StatusBarFrame.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import { requestSessionChange } from "./session-change.js";
import { useAgentContextSync } from "./useAgentContextSync.js";
import { useDocsNavigation } from "./useDocsNavigation.js";
import { useEntryReordering } from "./useEntryReordering.js";
import { useFilePanelNavigation } from "./useFilePanelNavigation.js";
import { useNativeEntryPicker } from "./useNativeEntryPicker.js";
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
    directoryPicker,
    serverInstanceId,
    isLoaded: isSessionLoaded,
    applyImportedEntries,
  } = useSessionEntries(() => {
    copyRequestId.current += 1;
    setCopyFeedback(null);
  });
  const pickerControl = useNativeEntryPicker({
    fileCapability: filePicker,
    directoryCapability: directoryPicker,
    selectEntry,
    setErrorMessage,
  });
  const search = useSearchNavigation(searchVersion);
  const docs = useDocsNavigation();
  const filePanel = useFilePanelNavigation(search.flushHistory);
  const entryReordering = useEntryReordering({
    entries,
    setEntries,
    setErrorMessage,
  });
  const sessionTransfer = useSessionTransfer({
    instanceId: serverInstanceId,
    applyImportedEntries,
    resetSearch: search.reset,
    setErrorMessage,
  });
  const selectedEntry = entries.find(({ id }) => id === selectedId) ?? null;
  const mainView = docs.isVisible
    ? "docs"
    : search.isVisible
      ? "search"
      : "preview";
  useAgentContextSync({
    activeEntryId: selectedEntry?.id ?? null,
    view: mainView,
    enabled: isSessionLoaded,
  });
  function selectEntry(id: string): void {
    copyRequestId.current += 1;
    setCopyFeedback(null);
    search.flushHistory();
    docs.hide();
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
    if (!removed) setErrorMessage("Could not remove the entry.");
  }
  async function clearEntries(): Promise<void> {
    if (entries.length === 0 || !window.confirm("Remove all entries?")) {
      return;
    }
    const cleared = await requestSessionChange("/api/session", {
      method: "DELETE",
    });
    if (!cleared) setErrorMessage("Could not remove all entries.");
  }
  function openSearch(): void {
    docs.hide();
    search.open();
  }
  function toggleDocs(): void {
    if (docs.isVisible) {
      docs.close();
      return;
    }
    search.flushHistory();
    search.showPreview();
    docs.open();
  }
  return (
    <StatusBarFrame
      isDocsVisible={docs.isVisible}
      docsButtonRef={docs.triggerRef}
      onToggleDocs={toggleDocs}
    >
      <ResizableLayout
        isFilePanelVisible={filePanel.isVisible}
        filePanel={
          filePanel.isVisible ? (
            <FilePanel
              entries={entries}
              selectedId={selectedId}
              view={filePanel.view}
              draggedId={entryReordering.draggedId}
              dropTargetId={entryReordering.dropTargetId}
              canPickFiles={filePicker.available}
              canPickDirectory={directoryPicker.available}
              nativePickerPending={pickerControl.pending}
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
              onDragStart={entryReordering.handleDragStart}
              onDragEnter={entryReordering.setDropTargetId}
              onDragEnd={entryReordering.resetDragState}
              onDrop={entryReordering.reorderEntries}
              onPickFiles={pickerControl.openFiles}
              onPickDirectory={pickerControl.openDirectory}
              onOpenSearch={openSearch}
              onImportSession={sessionTransfer.importFile}
              onExportSession={sessionTransfer.exportFile}
            />
          ) : null
        }
        viewer={
          <AppViewer
            search={search}
            docs={docs}
            selectedEntry={selectedEntry}
            reloadVersion={reloadVersion}
            isFilePanelVisible={filePanel.isVisible}
            errorMessage={errorMessage}
            copyFeedback={copyFeedback}
            canPickFiles={filePicker.available}
            isFilePickerOpen={pickerControl.isOpen}
            onSelect={selectSearchResult}
            onToggleFilePanel={filePanel.toggleVisibility}
            onCopyPath={copyPath}
            onRemove={removeEntry}
            onPickFiles={pickerControl.openFiles}
          />
        }
      />
    </StatusBarFrame>
  );
}
