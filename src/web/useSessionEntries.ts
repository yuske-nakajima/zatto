import { useEffect, useEffectEvent, useState } from "react";
import type { Entry, Session } from "../server/session.js";
import type { ServerMessage } from "../shared/protocol.js";
import { selectAvailableEntry } from "./file-panel-model.js";
import {
  pushSelectedEntryIdInUrl,
  readSelectedEntryIdFromUrl,
  replaceSelectedEntryIdInUrl,
} from "./selected-entry-url.js";
import type { SessionImportMode } from "./useSessionTransfer.js";

interface SessionEntries {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  selectedId: string | null;
  selectEntry: (id: string, historyMode?: "push" | "none") => void;
  reloadVersion: number;
  searchVersion: number;
  errorMessage: string | null;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  filePicker: FilePickerCapability;
  serverInstanceId: string | null;
  isLoaded: boolean;
  applyImportedEntries: (entries: Entry[], mode: SessionImportMode) => void;
}

export interface FilePickerCapability {
  available: boolean;
  instanceId: string | null;
}

interface SessionResponse extends Session {
  filePicker?: {
    available?: boolean;
    instanceId?: string;
  };
  serverIdentity?: { instanceId?: string };
}

export function useSessionEntries(onSessionUpdate: () => void): SessionEntries {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [searchVersion, setSearchVersion] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filePicker, setFilePicker] = useState<FilePickerCapability>({
    available: false,
    instanceId: null,
  });
  const [serverInstanceId, setServerInstanceId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  function selectEntry(
    id: string,
    historyMode: "push" | "none" = "push",
  ): void {
    setSelectedId(id);
    if (historyMode === "push") {
      pushSelectedEntryIdInUrl(id);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/session")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as SessionResponse;
      })
      .then((session) => {
        if (active) {
          setEntries(session.entries);
          setFilePicker({
            available: session.filePicker?.available === true,
            instanceId: session.filePicker?.instanceId ?? null,
          });
          setServerInstanceId(session.serverIdentity?.instanceId ?? null);
          setIsLoaded(true);
          setSelectedId(
            resolveSelectedEntryIdAndUpdateUrl(
              readSelectedEntryIdFromUrl(),
              session.entries,
            ),
          );
        }
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

  const restoreSelectedEntryFromUrl = useEffectEvent(() => {
    setSelectedId(
      resolveSelectedEntryIdAndUpdateUrl(readSelectedEntryIdFromUrl(), entries),
    );
  });

  useEffect(() => {
    window.addEventListener("popstate", restoreSelectedEntryFromUrl);
    return () =>
      window.removeEventListener("popstate", restoreSelectedEntryFromUrl);
  }, []);

  function applyImportedEntries(
    importedEntries: Entry[],
    mode: SessionImportMode,
  ): void {
    onSessionUpdate();
    setEntries(importedEntries);
    setSearchVersion((current) => current + 1);
    if (
      mode === "merge" &&
      selectedId !== null &&
      importedEntries.some(({ id }) => id === selectedId)
    ) {
      return;
    }
    setSelectedId(resolveSelectedEntryIdAndUpdateUrl(null, importedEntries));
  }

  const handleSocketMessage = useEffectEvent((event: MessageEvent) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      return;
    }
    if (message.type === "session:update") {
      onSessionUpdate();
      setSearchVersion((current) => current + 1);
      setEntries(message.entries);
      setSelectedId(
        resolveSelectedEntryIdAndUpdateUrl(selectedId, message.entries),
      );
      return;
    }
    if (message.type === "file:changed") {
      setSearchVersion((current) => current + 1);
      if (message.id === selectedId) {
        setReloadVersion((current) => current + 1);
      }
    }
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket.addEventListener("message", handleSocketMessage);
    return () => socket.close();
  }, []);

  return {
    entries,
    setEntries,
    selectedId,
    selectEntry,
    reloadVersion,
    searchVersion,
    errorMessage,
    setErrorMessage,
    filePicker,
    serverInstanceId,
    isLoaded,
    applyImportedEntries,
  };
}

function resolveSelectedEntryIdAndUpdateUrl(
  requestedId: string | null,
  availableEntries: Entry[],
): string | null {
  const selectedEntryId = selectAvailableEntry(requestedId, availableEntries);
  replaceSelectedEntryIdInUrl(selectedEntryId);
  return selectedEntryId;
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
