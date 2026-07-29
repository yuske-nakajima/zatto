import { useEffect, useEffectEvent, useState } from "react";
import type { Entry, Session } from "../server/session.js";
import type { ServerMessage } from "../shared/protocol.js";

export function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          setErrorMessage("セッションを読み込めませんでした");
        }
      });

    return () => {
      active = false;
    };
  }, []);

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
      return;
    }

    if (message.type === "file:changed" && message.id === selectedId) {
      setReloadVersion((current) => current + 1);
    }
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.addEventListener("open", () => {
      setConnectionState("connected");
    });
    socket.addEventListener("close", () => {
      setConnectionState("disconnected");
    });
    socket.addEventListener("message", handleSocketMessage);

    return () => {
      socket.close();
    };
  }, []);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? null;

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
    setErrorMessage("エントリを削除できませんでした");
  }

  async function clearEntries(): Promise<void> {
    if (
      entries.length === 0 ||
      !window.confirm("すべてのエントリを削除しますか？")
    ) {
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
    setErrorMessage("エントリを全削除できませんでした");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <p className="eyebrow">LOCAL HTML VIEWER</p>
            <h1>zatto</h1>
          </div>
          <span
            className={`connection-dot connection-dot--${connectionState}`}
            title={`WebSocket: ${connectionState}`}
          />
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
            全削除
          </button>
        </div>

        <nav className="entry-list" aria-label="HTML エントリ">
          {entries.map((entry, index) => (
            <div
              className={`entry-row${entry.id === selectedId ? " entry-row--selected" : ""}`}
              key={entry.id}
            >
              <button
                className="entry-select"
                type="button"
                aria-label={`${entry.title} を表示`}
                onClick={() => setSelectedId(entry.id)}
              >
                <span className="entry-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="entry-copy">
                  <strong>{entry.title}</strong>
                  <small>{fileName(entry.absPath)}</small>
                </span>
              </button>
              <button
                className="entry-remove"
                type="button"
                aria-label={`${entry.title} を削除`}
                onClick={() => removeEntry(entry.id)}
              >
                ×
              </button>
            </div>
          ))}
        </nav>

        {entries.length === 0 && (
          <div className="empty-list">
            <span>00</span>
            <p>CLI から HTML を追加してください</p>
            <code>zatto page.html</code>
          </div>
        )}

        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </aside>

      <section className="viewer">
        <header className="viewer-header">
          <div className="window-controls" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>{selectedEntry?.absPath ?? "NO FILE SELECTED"}</p>
        </header>

        <div className="viewer-canvas">
          {selectedEntry ? (
            <iframe
              key={`${selectedEntry.id}:${reloadVersion}`}
              title={`${selectedEntry.title} のプレビュー`}
              src={`/f/${encodeURIComponent(selectedEntry.id)}/`}
            />
          ) : (
            <div className="empty-viewer">
              <p>SELECT AN ENTRY</p>
              <span>左のリストから表示する HTML を選択</span>
            </div>
          )}
        </div>
      </section>
    </main>
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

function fileName(absPath: string): string {
  return absPath.split(/[\\/]/).at(-1) ?? absPath;
}
