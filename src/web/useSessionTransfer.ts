import { useState } from "react";
import type { Entry } from "../server/session.js";
import {
  parseSessionExchange,
  type SessionExchange,
} from "../shared/session-exchange.js";

interface SessionTransferOptions {
  instanceId: string | null;
  applyImportedEntries: (entries: Entry[]) => void;
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
  const [isPending, setIsPending] = useState(false);

  async function importFile(file: File): Promise<void> {
    setIsPending(true);
    options.setErrorMessage(null);
    try {
      const exchange = parseSessionExchange(
        JSON.parse(await file.text()) as unknown,
      );
      const response = await fetch("/api/session", {
        method: "PUT",
        headers: importHeaders(options.instanceId),
        body: JSON.stringify(exchange),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const session = (await response.json()) as { entries?: unknown };
      if (!isEntryArray(session.entries)) throw new Error("Invalid session");
      options.applyImportedEntries(session.entries);
      options.resetSearch();
    } catch {
      options.setErrorMessage("Could not import the session.");
    } finally {
      setIsPending(false);
    }
  }

  async function exportFile(): Promise<void> {
    setIsPending(true);
    options.setErrorMessage(null);
    try {
      const response = await fetch("/api/session/export");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const exchange = parseSessionExchange((await response.json()) as unknown);
      downloadSessionExchange(exchange);
    } catch {
      options.setErrorMessage("Could not export the session.");
    } finally {
      setIsPending(false);
    }
  }

  return { isPending, importFile, exportFile };
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
  anchor.download = "zatto-session.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
