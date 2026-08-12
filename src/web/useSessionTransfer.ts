import { useRef, useState } from "react";
import type { Entry } from "../server/session.js";
import {
  parseSessionExchange,
  type SessionExchange,
  sortSessionExchangeEntriesByPath,
} from "../shared/session-exchange.js";

export type SessionTransferPending = "import" | "export" | null;
export type SessionImportMode = "replace" | "merge";
export type SessionExportOrder = "keep" | "sort";

interface SessionTransferOptions {
  instanceId: string | null;
  applyImportedEntries: (entries: Entry[], mode: SessionImportMode) => void;
  resetSearch: () => void;
  setErrorMessage: (message: string | null) => void;
}

/**
 * Coordinates browser upload and download for session exchange documents.
 *
 * @param options - Session identity and state update callbacks
 * @returns Import and export actions with their pending state
 */
export function useSessionTransfer(options: SessionTransferOptions) {
  const [pending, setPending] = useState<SessionTransferPending>(null);
  const pendingRef = useRef<SessionTransferPending>(null);

  async function importFile(
    file: File,
    mode: SessionImportMode,
  ): Promise<void> {
    if (!beginTransfer("import")) return;
    options.setErrorMessage(null);
    try {
      const exchange = parseSessionExchange(
        JSON.parse(await file.text()) as unknown,
      );
      const response = await fetch(`/api/session?mode=${mode}`, {
        method: "PUT",
        headers: importHeaders(options.instanceId),
        body: JSON.stringify(exchange),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const session = (await response.json()) as { entries?: unknown };
      if (!isEntryArray(session.entries)) throw new Error("Invalid session");
      options.applyImportedEntries(session.entries, mode);
      if (mode === "replace") options.resetSearch();
    } catch {
      options.setErrorMessage("Could not import the session.");
    } finally {
      endTransfer();
    }
  }

  async function exportFile(order: SessionExportOrder): Promise<void> {
    if (!beginTransfer("export")) return;
    options.setErrorMessage(null);
    try {
      const response = await fetch("/api/session/export");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const exchange = parseSessionExchange((await response.json()) as unknown);
      downloadSessionExchange(
        order === "sort"
          ? {
              ...exchange,
              entries: sortSessionExchangeEntriesByPath(exchange.entries),
            }
          : exchange,
      );
    } catch {
      options.setErrorMessage("Could not export the session.");
    } finally {
      endTransfer();
    }
  }

  function beginTransfer(kind: Exclude<SessionTransferPending, null>): boolean {
    if (pendingRef.current !== null) return false;
    pendingRef.current = kind;
    setPending(kind);
    return true;
  }

  function endTransfer(): void {
    pendingRef.current = null;
    setPending(null);
  }

  return { pending, importFile, exportFile };
}

function importHeaders(instanceId: string | null): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(instanceId ? { "x-zatto-instance-id": instanceId } : {}),
  };
}

function isEntryArray(value: unknown): value is Entry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Partial<Entry>).id === "string" &&
        typeof (entry as Partial<Entry>).absPath === "string" &&
        typeof (entry as Partial<Entry>).title === "string" &&
        typeof (entry as Partial<Entry>).addedAt === "number",
    )
  );
}

function downloadSessionExchange(exchange: SessionExchange): void {
  const blob = new Blob([`${JSON.stringify(exchange, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sessionExportFileName(new Date());
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sessionExportFileName(savedAt: Date): string {
  const date = [
    String(savedAt.getFullYear()).padStart(4, "0"),
    zeroPad(savedAt.getMonth() + 1),
    zeroPad(savedAt.getDate()),
  ].join("");
  const time = [
    zeroPad(savedAt.getHours()),
    zeroPad(savedAt.getMinutes()),
    zeroPad(savedAt.getSeconds()),
  ].join("");
  return `zatto-session-${date}-${time}.json`;
}

function zeroPad(value: number): string {
  return String(value).padStart(2, "0");
}
