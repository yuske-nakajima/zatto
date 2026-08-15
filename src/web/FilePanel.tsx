import type { DragEvent, RefObject } from "react";
import type { Entry } from "../server/session.js";
import { AddEntryControls } from "./AddEntryControls.js";
import zattoLogoBlack from "./assets/zatto-logo-black.png";
import zattoLogoWhite from "./assets/zatto-logo-white.png";
import { DirectoryTree } from "./DirectoryTree.js";
import { EntryRow } from "./EntryRow.js";
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

const DARK_COLOR_SCHEME = "(prefers-color-scheme: dark)";

interface FilePanelProps {
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
  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <p className="eyebrow">LOCAL HTML VIEWER</p>
        <h1>
          <picture>
            <source media={DARK_COLOR_SCHEME} srcSet={zattoLogoWhite} />
            <img src={zattoLogoBlack} alt="zatto" />
          </picture>
        </h1>
      </header>
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
            data-status-description="Remove all files from this session."
            type="button"
            aria-label="Clear all"
            disabled={entries.length === 0}
            onClick={onClear}
          >
            Clear All
          </button>
        </div>
      </div>
      <fieldset className="view-switcher">
        <legend className="visually-hidden">File panel view</legend>
        <button
          type="button"
          data-status-description="Show files in list order."
          aria-pressed={view === "list"}
          onClick={() => onViewChange("list")}
        >
          List
        </button>
        <button
          type="button"
          data-status-description="Group files by folder."
          aria-pressed={view === "directories"}
          onClick={() => onViewChange("directories")}
        >
          Folders
        </button>
        <button
          ref={searchButtonRef}
          className="search-mode-button"
          data-status-description="Search HTML files in this session."
          type="button"
          aria-label={
            !isSearchVisible && hasSearchState
              ? "Back to search results"
              : "Search"
          }
          aria-pressed={isSearchVisible}
          onClick={onOpenSearch}
        >
          <span className="search-glyph" aria-hidden="true" />
          {!isSearchVisible && hasSearchState && (
            <span className="search-state-dot" aria-hidden="true" />
          )}
        </button>
      </fieldset>
      <div className="sidebar-scroll-region">
        {view === "list" ? (
          <ol className="entry-list" aria-label="HTML entries">
            {entries.map((entry) => (
              <EntryRow
                entry={entry}
                isSelected={entry.id === selectedId}
                isDragging={entry.id === draggedId}
                isDropTarget={entry.id === dropTargetId}
                key={entry.id}
                onSelect={onSelect}
                onCopyPath={onCopyPath}
                onRemove={onRemove}
                onDragStart={onDragStart}
                onDragEnter={onDragEnter}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
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
            onRemoveEntries={onRemoveEntries}
          />
        )}
        {entries.length === 0 && (
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
