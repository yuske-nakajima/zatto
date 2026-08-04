import { type DragEvent, useEffect, useRef, useState } from "react";
import { FilePanel } from "./FilePanel.js";
import {
  type FilePanelView,
  moveEntry,
  readFilePanelView,
  storeFilePanelView,
} from "./file-panel-model.js";
import { ResizableLayout } from "./ResizableLayout.js";
import { useNativeFilePicker } from "./useNativeFilePicker.js";
import { useSessionEntries } from "./useSessionEntries.js";
import { type CopyFeedback, Viewer } from "./Viewer.js";

export { buildDirectoryTree } from "./directory-tree-model.js";
export {
  moveEntry,
  selectAvailableEntry,
} from "./file-panel-model.js";

export function App() {
  const copyRequestId = useRef(0);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const {
    entries,
    setEntries,
    selectedId,
    selectEntry: selectSessionEntry,
    reloadVersion,
    errorMessage,
    setErrorMessage,
    filePicker,
  } = useSessionEntries(() => {
    copyRequestId.current += 1;
    setCopyFeedback(null);
  });
  const [filePanelView, setFilePanelView] =
    useState<FilePanelView>(readFilePanelView);
  const [isFilePanelVisible, setIsFilePanelVisible] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const filePickerControl = useNativeFilePicker({
    capability: filePicker,
    selectEntry,
    setErrorMessage,
  });
  useEffect(() => storeFilePanelView(filePanelView), [filePanelView]);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? null;

  function selectEntry(id: string): void {
    copyRequestId.current += 1;
    selectSessionEntry(id);
    setCopyFeedback(null);
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
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    const row = event.currentTarget.closest<HTMLElement>(".entry-row");
    if (row && typeof event.dataTransfer.setDragImage === "function") {
      const bounds = row.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        row,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
    }
    setDraggedId(id);
  }

  return (
    <ResizableLayout
      isFilePanelVisible={isFilePanelVisible}
      filePanel={
        isFilePanelVisible ? (
          <FilePanel
            entries={entries}
            selectedId={selectedId}
            view={filePanelView}
            draggedId={draggedId}
            dropTargetId={dropTargetId}
            canPickFiles={filePicker.available}
            isFilePickerOpen={filePickerControl.isOpen}
            onViewChange={setFilePanelView}
            onClear={() => void clearEntries()}
            onSelect={selectEntry}
            onCopyPath={(path) => void copyPath(path)}
            onRemove={(id) => void removeEntry(id)}
            onDragStart={handleDragStart}
            onDragEnter={setDropTargetId}
            onDragEnd={resetDragState}
            onDrop={(id) => void reorderEntries(id)}
            onPickFiles={() => void filePickerControl.open()}
          />
        ) : null
      }
      viewer={
        <Viewer
          selectedEntry={selectedEntry}
          reloadVersion={reloadVersion}
          isFilePanelVisible={isFilePanelVisible}
          errorMessage={errorMessage}
          copyFeedback={copyFeedback}
          canPickFiles={filePicker.available}
          isFilePickerOpen={filePickerControl.isOpen}
          onToggleFilePanel={() =>
            setIsFilePanelVisible((isVisible) => !isVisible)
          }
          onCopyPath={(path) => void copyPath(path)}
          onPickFiles={() => void filePickerControl.open()}
        />
      }
    />
  );
}

async function requestSessionChange(
  path: string,
  init: RequestInit,
): Promise<boolean> {
  try {
    return (await fetch(path, init)).ok;
  } catch {
    return false;
  }
}
