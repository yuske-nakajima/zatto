import { type DragEvent, useEffect, useEffectEvent, useState } from "react";
import type { Entry, Session } from "../server/session.js";
import type { ServerMessage } from "../shared/protocol.js";
import zattoLogo from "./assets/zatto-logo-black.png";

export type FilePanelView = "list" | "directories";

export type DirectoryGroup = {
  directory: string;
  name: string;
  entries: Entry[];
};

interface CopyFeedback {
  kind: "success" | "error";
  message: string;
}

const FILE_PANEL_VIEW_KEY = "zatto:file-panel-view";

export function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [filePanelView, setFilePanelView] =
    useState<FilePanelView>(readFilePanelView);
  const [isFilePanelVisible, setIsFilePanelVisible] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/session")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as Session;
      })
      .then((session) => {
        if (!active) {
          return;
        }
        setEntries(session.entries);
        setSelectedId((current) =>
          selectAvailableEntry(current, session.entries),
        );
      })
      .catch(() => {
        if (active) {
          setErrorMessage("Could not load the session.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    storeFilePanelView(filePanelView);
  }, [filePanelView]);

  const handleSocketMessage = useEffectEvent((event: MessageEvent) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      return;
    }

    if (message.type === "session:update") {
      setEntries(message.entries);
      setSelectedId((current) =>
        selectAvailableEntry(current, message.entries),
      );
      setCopyFeedback(null);
      return;
    }

    if (message.type === "file:changed" && message.id === selectedId) {
      setReloadVersion((current) => current + 1);
    }
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.addEventListener("message", handleSocketMessage);

    return () => {
      socket.close();
    };
  }, []);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? null;

  function selectEntry(id: string): void {
    setSelectedId(id);
    setCopyFeedback(null);
  }

  async function copySelectedFilePath(): Promise<void> {
    if (!selectedEntry) {
      return;
    }

    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(selectedEntry.absPath);
      setCopyFeedback({ kind: "success", message: "Path copied." });
    } catch {
      setCopyFeedback({
        kind: "error",
        message: "Could not copy the file path.",
      });
    }
  }

  async function removeEntry(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/session/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (response.ok) {
        return;
      }
    } catch {
      // 下の共通エラー表示へ進む。
    }
    setErrorMessage("Could not remove the entry.");
  }

  async function clearEntries(): Promise<void> {
    if (entries.length === 0 || !window.confirm("Remove all entries?")) {
      return;
    }

    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (response.ok) {
        return;
      }
    } catch {
      // 下の共通エラー表示へ進む。
    }
    setErrorMessage("Could not remove all entries.");
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

    try {
      const response = await fetch("/api/session/order", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: reorderedEntries.map((entry) => entry.id),
        }),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // 下の共通エラー表示へ進む。
    }

    setEntries(previousEntries);
    setErrorMessage("Could not reorder the entries.");
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
    setDraggedId(id);
  }

  return (
    <main
      className={`app-shell${isFilePanelVisible ? "" : " app-shell--panel-hidden"}`}
    >
      {isFilePanelVisible && (
        <aside className="sidebar">
          <header className="sidebar-header">
            <div>
              <p className="eyebrow">LOCAL HTML VIEWER</p>
              <h1>
                <img src={zattoLogo} alt="zatto" />
              </h1>
            </div>
          </header>

          <div className="list-heading">
            <span>
              entries <strong>{entries.length}</strong>
            </span>
            <button
              className="clear-button"
              type="button"
              disabled={entries.length === 0}
              onClick={clearEntries}
            >
              Clear all
            </button>
          </div>

          <fieldset className="view-switcher">
            <legend className="visually-hidden">File panel view</legend>
            <button
              type="button"
              aria-pressed={filePanelView === "list"}
              onClick={() => setFilePanelView("list")}
            >
              List
            </button>
            <button
              type="button"
              aria-pressed={filePanelView === "directories"}
              onClick={() => setFilePanelView("directories")}
            >
              Folders
            </button>
          </fieldset>

          {filePanelView === "list" ? (
            <ol className="entry-list" aria-label="HTML entries">
              {entries.map((entry, index) => (
                <EntryRow
                  entry={entry}
                  index={index}
                  isSelected={entry.id === selectedId}
                  isDragging={entry.id === draggedId}
                  isDropTarget={entry.id === dropTargetId}
                  key={entry.id}
                  onSelect={selectEntry}
                  onRemove={removeEntry}
                  onDragStart={handleDragStart}
                  onDragEnter={setDropTargetId}
                  onDragEnd={resetDragState}
                  onDrop={reorderEntries}
                />
              ))}
            </ol>
          ) : (
            <nav className="entry-list" aria-label="HTML entries by folder">
              {groupEntriesByDirectory(entries).map((group) => (
                <section className="directory-group" key={group.directory}>
                  <header className="directory-heading">
                    <strong>{group.name}</strong>
                    <small title={group.directory}>{group.directory}</small>
                  </header>
                  <ul className="directory-entry-list">
                    {group.entries.map((entry) => (
                      <EntryRow
                        entry={entry}
                        isSelected={entry.id === selectedId}
                        key={entry.id}
                        onSelect={selectEntry}
                        onRemove={removeEntry}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          )}

          {entries.length === 0 && (
            <div className="empty-list">
              <span>00</span>
              <p>Add HTML files from the CLI</p>
              <code>zatto page.html</code>
            </div>
          )}

          {errorMessage && <p className="error-message">{errorMessage}</p>}
        </aside>
      )}

      <section className="viewer">
        <header className="viewer-header">
          <button
            className="file-panel-toggle"
            type="button"
            aria-label={
              isFilePanelVisible ? "Hide file panel" : "Show file panel"
            }
            onClick={() => setIsFilePanelVisible((isVisible) => !isVisible)}
          >
            <span aria-hidden="true">{isFilePanelVisible ? "⇤" : "⇥"}</span>
          </button>
          <p title={selectedEntry?.absPath}>
            {selectedEntry?.absPath ?? "NO FILE SELECTED"}
          </p>
          <button
            className="copy-path-button"
            type="button"
            aria-label="Copy file path"
            disabled={!selectedEntry}
            onClick={() => void copySelectedFilePath()}
          >
            Copy
          </button>
          {copyFeedback && (
            <span
              className={`copy-feedback copy-feedback--${copyFeedback.kind}`}
              role={copyFeedback.kind === "error" ? "alert" : "status"}
            >
              {copyFeedback.message}
            </span>
          )}
        </header>

        <div className="viewer-canvas">
          {selectedEntry ? (
            <iframe
              key={`${selectedEntry.id}:${reloadVersion}`}
              title={`${selectedEntry.title} preview`}
              src={`/f/${encodeURIComponent(selectedEntry.id)}/`}
            />
          ) : (
            <div className="empty-viewer">
              <p>SELECT AN ENTRY</p>
              <span>Choose an HTML file from the panel</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

type EntryRowProps = {
  entry: Entry;
  index?: number;
  isSelected: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>, id: string) => void;
  onDragEnter?: (id: string) => void;
  onDragEnd?: () => void;
  onDrop?: (id: string) => void;
};

function EntryRow({
  entry,
  index,
  isSelected,
  isDragging = false,
  isDropTarget = false,
  onSelect,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: EntryRowProps) {
  const draggable = Boolean(onDragStart);
  const rowClassNames = [
    "entry-row",
    isSelected && "entry-row--selected",
    isDragging && "entry-row--dragging",
    isDropTarget && !isDragging && "entry-row--drop-target",
    !draggable && "entry-row--grouped",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={rowClassNames}
      onDragOver={
        onDrop
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onDragEnter?.(entry.id);
            }
          : undefined
      }
      onDrop={
        onDrop
          ? (event) => {
              event.preventDefault();
              void onDrop(entry.id);
            }
          : undefined
      }
    >
      {draggable && (
        <button
          className="entry-drag"
          type="button"
          draggable
          aria-label={`Reorder ${entry.title}`}
          onDragStart={(event) => onDragStart?.(event, entry.id)}
          onDragEnd={onDragEnd}
        >
          ⠿
        </button>
      )}
      <button
        className="entry-select"
        type="button"
        aria-label={`Open ${entry.title}`}
        onClick={() => onSelect(entry.id)}
      >
        {index !== undefined && (
          <span className="entry-index">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <span className="entry-copy">
          <strong title={entry.title}>{entry.title}</strong>
          <small title={entry.absPath}>{fileName(entry.absPath)}</small>
        </span>
      </button>
      <button
        className="entry-remove"
        type="button"
        aria-label={`Remove ${entry.title}`}
        onClick={() => onRemove(entry.id)}
      >
        ×
      </button>
    </li>
  );
}

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

export function groupEntriesByDirectory(entries: Entry[]): DirectoryGroup[] {
  const groups = new Map<string, DirectoryGroup>();
  for (const entry of entries) {
    const directory = parentDirectory(entry.absPath);
    const group = groups.get(directory);
    if (group) {
      group.entries.push(entry);
      continue;
    }

    groups.set(directory, {
      directory,
      name: fileName(directory),
      entries: [entry],
    });
  }
  return [...groups.values()];
}

function readFilePanelView(): FilePanelView {
  try {
    const storedView = window.localStorage.getItem(FILE_PANEL_VIEW_KEY);
    return storedView === "directories" ? "directories" : "list";
  } catch {
    return "list";
  }
}

function storeFilePanelView(filePanelView: FilePanelView): void {
  try {
    window.localStorage.setItem(FILE_PANEL_VIEW_KEY, filePanelView);
  } catch {
    // ブラウザがストレージを無効化していても表示切り替えは継続する。
  }
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    return JSON.parse(data) as ServerMessage;
  } catch {
    return null;
  }
}

function parentDirectory(absPath: string): string {
  const normalizedPath = absPath.replaceAll("\\", "/");
  const separatorIndex = normalizedPath.lastIndexOf("/");
  if (separatorIndex < 0) {
    return ".";
  }
  return normalizedPath.slice(0, separatorIndex) || "/";
}

function fileName(absPath: string): string {
  return absPath.split(/[\\/]/).filter(Boolean).at(-1) ?? absPath;
}
