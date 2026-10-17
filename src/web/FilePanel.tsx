import type { DragEvent, ReactNode, RefObject } from "react";
import type { Entry } from "../server/session.js";
import { AddEntryControls } from "./AddEntryControls.js";
import { DirectoryTree } from "./DirectoryTree.js";
import { EntryRow } from "./EntryRow.js";
import { FilePanelHeader } from "./FilePanelHeader.js";
import { FilePanelViews } from "./FilePanelViews.js";
import type { FilePanelView } from "./file-panel-model.js";
import { SessionActions } from "./SessionActions.js";
import type {
  DirectoryPickerMode,
  NativePickerPending,
} from "./useNativeEntryPicker.js";
import type {
  SessionExportOrder,
  SessionImportMode,
  SessionTransferPending,
} from "./useSessionTransfer.js";

interface FilePanelProps {
  workspaceControls?: ReactNode;
  entries: Entry[];
  selectedId: string | null;
  view: FilePanelView;
  draggedId: string | null;
  dropTargetId: string | null;
  canPickFiles: boolean;
  canPickDirectory: boolean;
  nativePickerPending: NativePickerPending;
  sessionTransferPending: SessionTransferPending;
  isSessionLoaded: boolean;
  isSearchVisible: boolean;
  hasSearchState: boolean;
  searchButtonRef: RefObject<HTMLButtonElement | null>;
  onViewChange: (view: FilePanelView) => void;
  onClear: () => void;
  onSelect: (id: string) => void;
  onCopyPath: (path: string) => void;
  onRemove: (id: string) => void;
  onFavorite?: (id: string, favorite: boolean) => Promise<void>;
  onRemoveEntries: (ids: string[]) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onPickFiles: () => void;
  onPickDirectory: (mode: DirectoryPickerMode) => void;
  onOpenSearch: () => void;
  onImportSession: (file: File, mode: SessionImportMode) => Promise<void>;
  onExportSession: (order: SessionExportOrder) => void;
}

export function FilePanel({
  workspaceControls,
  entries,
  selectedId,
  view,
  draggedId,
  dropTargetId,
  canPickFiles,
  canPickDirectory,
  nativePickerPending,
  sessionTransferPending,
  isSessionLoaded,
  isSearchVisible,
  hasSearchState,
  searchButtonRef,
  onViewChange,
  onClear,
  onSelect,
  onCopyPath,
  onRemove,
  onFavorite,
  onRemoveEntries,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onPickFiles,
  onPickDirectory,
  onOpenSearch,
  onImportSession,
  onExportSession,
}: FilePanelProps) {
  const visibleEntries =
    view === "favorites" ? entries.filter((entry) => entry.favorite) : entries;
  return (
    <aside className="sidebar">
      <FilePanelHeader />
      {workspaceControls}
      <div className="list-heading">
        <span className="entry-count">
          ENTRIES <strong>{entries.length}</strong>
        </span>
        <div className="list-actions">
          <AddEntryControls
            canPickFiles={canPickFiles}
            canPickDirectory={canPickDirectory}
            pending={nativePickerPending}
            onPickFiles={onPickFiles}
            onPickDirectory={onPickDirectory}
          />
          <button
            className="clear-button"
            data-status-description={
              view === "favorites"
                ? "Switch to List or Folders to clear this workspace."
                : "Remove all files from this session."
            }
            type="button"
            aria-label="Clear all"
            disabled={entries.length === 0 || view === "favorites"}
            onClick={onClear}
          >
            Clear All
          </button>
        </div>
      </div>
      <FilePanelViews
        view={view}
        onViewChange={onViewChange}
        isSearchVisible={isSearchVisible}
        hasSearchState={hasSearchState}
        searchButtonRef={searchButtonRef}
        onOpenSearch={onOpenSearch}
      />
      <div className="sidebar-scroll-region">
        {view !== "directories" ? (
          <ol
            className="entry-list"
            aria-label={
              view === "favorites" ? "Favorite HTML entries" : "HTML entries"
            }
          >
            {visibleEntries.map((entry) => (
              <EntryRow
                entry={entry}
                isSelected={entry.id === selectedId}
                isDragging={view === "list" && entry.id === draggedId}
                isDropTarget={view === "list" && entry.id === dropTargetId}
                key={entry.id}
                onSelect={onSelect}
                onCopyPath={onCopyPath}
                onRemove={onRemove}
                onFavorite={onFavorite}
                onDragStart={view === "list" ? onDragStart : undefined}
                onDragEnter={view === "list" ? onDragEnter : undefined}
                onDragEnd={onDragEnd}
                onDrop={view === "list" ? onDrop : undefined}
              />
            ))}
          </ol>
        ) : (
          <DirectoryTree
            entries={entries}
            selectedId={selectedId}
            onSelect={onSelect}
            onCopyPath={onCopyPath}
            onRemove={onRemove}
            onFavorite={onFavorite}
            onRemoveEntries={onRemoveEntries}
          />
        )}
        {view === "favorites" && visibleEntries.length === 0 && (
          <div className="empty-list">
            <p>No favorites in this workspace.</p>
            <p>Star files in List or Folders to find them here.</p>
          </div>
        )}
        {view !== "favorites" && entries.length === 0 && (
          <div className="empty-list">
            <p>Add HTML files from the CLI</p>
            <code>zatto page.html</code>
          </div>
        )}
      </div>
      <SessionActions
        isAvailable={isSessionLoaded}
        pending={sessionTransferPending}
        onImport={onImportSession}
        onExport={onExportSession}
      />
    </aside>
  );
}
