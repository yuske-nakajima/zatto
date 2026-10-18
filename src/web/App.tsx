import { useState } from "react";
import { rpcCall } from "../shared/rpc-client.js";
import { AppViewer } from "./AppViewer.js";
import { FilePanel } from "./FilePanel.js";
import { createFolderSessionRemover } from "./folder-session-removal.js";
import { ResizableLayout } from "./ResizableLayout.js";
import { ReviewStatusBar } from "./ReviewStatusBar.js";
import { ReviewFileStatesProvider } from "./review-status-context.js";
import { StatusBarFrame } from "./StatusBarFrame.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import { useAgentContextSync } from "./useAgentContextSync.js";
import { useCopyPath } from "./useCopyPath.js";
import { useDocsNavigation } from "./useDocsNavigation.js";
import { useEntryReordering } from "./useEntryReordering.js";
import { useFilePanelNavigation } from "./useFilePanelNavigation.js";
import { useMarkdownTaskBridge } from "./useMarkdownTaskBridge.js";
import { useNativeEntryPicker } from "./useNativeEntryPicker.js";
import { useReviewThreads } from "./useReviewThreads.js";
import { useSearchNavigation } from "./useSearchNavigation.js";
import { useSessionEntries } from "./useSessionEntries.js";
import { useSessionTransfer } from "./useSessionTransfer.js";
import { WorkspaceControls } from "./WorkspaceControls.js";
import { workspaceEntryActions } from "./workspace-entry-actions.js";

export { buildDirectoryTree } from "./directory-tree-model.js";
export { moveEntry, selectAvailableEntry } from "./file-panel-model.js";
export function App() {
  const { copyFeedback, copyPath, resetCopyFeedback } = useCopyPath();
  const {
    workspaceState,
    isCurrentWorkspace,
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
  } = useSessionEntries((workspaceChanged) => {
    if (workspaceChanged) {
      search.reset();
      docs.hide();
      entryReordering.resetDragState();
    }
    resetCopyFeedback();
  });
  const workspaceId = workspaceState?.activeWorkspaceId ?? null;
  const pickerControl = useNativeEntryPicker({
    workspaceId,
    isCurrentWorkspace,
    fileCapability: filePicker,
    directoryCapability: directoryPicker,
    selectEntry,
    setErrorMessage,
  });
  const review = useReviewThreads(workspaceId, selectedId, setErrorMessage);
  const [requestedThreadId, setRequestedThreadId] = useState<string | null>(
    null,
  );
  useMarkdownTaskBridge({
    workspaceId,
    selectedEntryId: selectedId,
    setErrorMessage,
  });
  const search = useSearchNavigation(searchVersion);
  const docs = useDocsNavigation();
  const filePanel = useFilePanelNavigation(search.flushHistory);
  const entryReordering = useEntryReordering({
    workspaceId,
    isCurrentWorkspace,
    entries,
    setEntries,
    setErrorMessage,
  });
  const sessionTransfer = useSessionTransfer({
    workspaceId,
    isCurrentWorkspace,
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
    workspaceId,
    activeEntryId: selectedEntry?.id ?? null,
    view: mainView,
    enabled: isSessionLoaded,
  });
  function selectEntry(id: string): void {
    resetCopyFeedback();
    search.flushHistory();
    docs.hide();
    selectSessionEntry(id);
    search.showPreview();
  }
  async function registerLinkedFile(absPath: string): Promise<string | null> {
    if (!workspaceId) return null;
    try {
      const result = await rpcCall("session.add", {
        workspaceId,
        paths: [absPath],
      });
      return result.resolved[0]?.id ?? null;
    } catch {
      setErrorMessage("Could not register the page.");
      return null;
    }
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
    resetCopyFeedback();
    selectSessionEntry(id, "none");
    search.openResult(id, locator);
  }
  const { removeEntry, clearEntries, setFavorite } = workspaceEntryActions(
    workspaceId,
    entries.length > 0,
    setErrorMessage,
  );
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
    <ReviewFileStatesProvider value={review.fileStates}>
      <StatusBarFrame
        isDocsVisible={docs.isVisible}
        docsButtonRef={docs.triggerRef}
        onToggleDocs={toggleDocs}
        activity={
          <ReviewStatusBar
            review={review}
            entries={entries}
            onOpen={(entryId, threadId) => {
              selectEntry(entryId);
              setRequestedThreadId(threadId);
            }}
          />
        }
      >
        <ResizableLayout
          isFilePanelVisible={filePanel.isVisible}
          filePanel={
            filePanel.isVisible ? (
              <FilePanel
                workspaceControls={
                  <WorkspaceControls
                    state={workspaceState}
                    reportError={setErrorMessage}
                  />
                }
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
                onFavorite={setFavorite}
                onRemove={removeEntry}
                onRemoveEntries={createFolderSessionRemover(
                  setErrorMessage,
                  workspaceId,
                )}
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
              review={review}
              requestedThreadId={requestedThreadId}
              onRequestedThreadOpened={() => setRequestedThreadId(null)}
              linkedPages={{
                entries,
                open: selectEntry,
                register: registerLinkedFile,
              }}
            />
          }
        />
      </StatusBarFrame>
    </ReviewFileStatesProvider>
  );
}
