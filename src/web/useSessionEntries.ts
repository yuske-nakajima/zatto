import { useEffect, useEffectEvent, useState } from "react";
import type { Entry, Session } from "../server/session.js";
import type { ServerMessage } from "../shared/protocol.js";
import { selectAvailableEntry } from "./file-panel-model.js";

interface SessionEntries {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  reloadVersion: number;
  errorMessage: string | null;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useSessionEntries(onSessionUpdate: () => void): SessionEntries {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
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
        if (active) {
          setEntries(session.entries);
          setSelectedId((current) =>
            selectAvailableEntry(current, session.entries),
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

  const handleSocketMessage = useEffectEvent((event: MessageEvent) => {
    const message = parseServerMessage(event.data);
    if (!message) {
      return;
    }
    if (message.type === "session:update") {
      onSessionUpdate();
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
    socket.addEventListener("message", handleSocketMessage);
    return () => socket.close();
  }, []);

  return {
    entries,
    setEntries,
    selectedId,
    setSelectedId,
    reloadVersion,
    errorMessage,
    setErrorMessage,
  };
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
