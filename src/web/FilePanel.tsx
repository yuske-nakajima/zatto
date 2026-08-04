import type { DragEvent } from "react";
import type { Entry } from "../server/session.js";
import zattoLogo from "./assets/zatto-logo-black.png";
import { DirectoryTree } from "./DirectoryTree.js";
import { EntryRow } from "./EntryRow.js";
import type { FilePanelView } from "./file-panel-model.js";

interface FilePanelProps {
  entries: Entry[];
  selectedId: string | null;
  view: FilePanelView;
  draggedId: string | null;
  dropTargetId: string | null;
  canPickFiles: boolean;
  isFilePickerOpen: boolean;
  onViewChange: (view: FilePanelView) => void;
  onClear: () => void;
  onSelect: (id: string) => void;
  onCopyPath: (path: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onPickFiles: () => void;
}

export function FilePanel({
  entries,
  selectedId,
  view,
  draggedId,
  dropTargetId,
  canPickFiles,
  isFilePickerOpen,
  onViewChange,
  onClear,
  onSelect,
  onCopyPath,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onPickFiles,
}: FilePanelProps) {
  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <p className="eyebrow">LOCAL HTML VIEWER</p>
        <h1>
          <img src={zattoLogo} alt="zatto" />
        </h1>
      </header>
      <div className="list-heading">
        <span className="entry-count">
          ENTRIES <strong>{entries.length}</strong>
        </span>
        <span className="list-actions">
          {canPickFiles && (
            <button
              className="add-button"
              type="button"
              aria-label="Add HTML files"
              disabled={isFilePickerOpen}
              onClick={onPickFiles}
            >
              {isFilePickerOpen ? "Opening…" : "+ Add"}
            </button>
          )}
          <button
            className="clear-button"
            type="button"
            aria-label="Clear all"
            disabled={entries.length === 0}
            onClick={onClear}
          >
            Clear All
          </button>
        </span>
      </div>
      <fieldset className="view-switcher">
        <legend className="visually-hidden">File panel view</legend>
        <button
          type="button"
          aria-pressed={view === "list"}
          onClick={() => onViewChange("list")}
        >
          List
        </button>
        <button
          type="button"
          aria-pressed={view === "directories"}
          onClick={() => onViewChange("directories")}
        >
          Folders
        </button>
      </fieldset>
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
        />
      )}
      {entries.length === 0 && (
        <div className="empty-list">
          <p>Add HTML files from the CLI</p>
          <code>zatto page.html</code>
        </div>
      )}
    </aside>
  );
}
