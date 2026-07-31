import type { DragEvent } from "react";
import type { Entry } from "../server/session.js";
import zattoLogo from "./assets/zatto-logo-black.png";
import { EntryRow } from "./EntryRow.js";
import {
  type FilePanelView,
  groupEntriesByDirectory,
} from "./file-panel-model.js";
import { Icon } from "./icons.js";

interface FilePanelProps {
  entries: Entry[];
  selectedId: string | null;
  view: FilePanelView;
  draggedId: string | null;
  dropTargetId: string | null;
  onViewChange: (view: FilePanelView) => void;
  onClear: () => void;
  onSelect: (id: string) => void;
  onCopyPath: (path: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
}

export function FilePanel({
  entries,
  selectedId,
  view,
  draggedId,
  dropTargetId,
  onViewChange,
  onClear,
  onSelect,
  onCopyPath,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
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
        <button
          className="clear-button"
          type="button"
          aria-label="Clear all"
          disabled={entries.length === 0}
          onClick={onClear}
        >
          Clear All
        </button>
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
        <nav className="entry-list" aria-label="HTML entries by folder">
          {groupEntriesByDirectory(entries).map((group) => (
            <section className="directory-group" key={group.directory}>
              <header className="directory-heading">
                <span className="directory-title">
                  <Icon name="folder" size={14} />
                  <strong>{group.name}</strong>
                </span>
                <button
                  className="directory-path-copy icon-button"
                  type="button"
                  aria-label={`Copy directory path ${group.directory}`}
                  onClick={() => onCopyPath(group.directory)}
                >
                  <Icon name="clipboardCopy" size={12} />
                </button>
              </header>
              <ul className="directory-entry-list">
                {group.entries.map((entry) => (
                  <EntryRow
                    grouped
                    entry={entry}
                    isSelected={entry.id === selectedId}
                    key={entry.id}
                    onSelect={onSelect}
                    onCopyPath={onCopyPath}
                    onRemove={onRemove}
                  />
                ))}
              </ul>
            </section>
          ))}
        </nav>
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
