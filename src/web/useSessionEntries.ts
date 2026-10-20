import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Entry } from "../server/session.js";
import type { WorkspaceState } from "../server/workspace-state.js";
import { rpcCall } from "../shared/rpc-client.js";
import {
  type NativePickerCapabilities,
  readNativePickerCapabilities,
} from "./native-picker-capability.js";
import {
  pushSelectedEntryIdInUrl,
  readSelectedEntryIdFromUrl,
} from "./selected-entry-url.js";
import { publishServerMessage } from "./server-messages.js";
import {
  parseServerMessage,
  resolveSelectedEntryIdAndUpdateUrl,
} from "./session-message.js";
import type { SessionImportMode } from "./useSessionTransfer.js";

export function useSessionEntries(
  onSessionUpdate: (workspaceChanged?: boolean) => void,
) {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState | null>(
    null,
  );
  const workspaceIdRef = useRef<string | null>(null);
  const socketUpdateRef = useRef(0);
  const sessionRevision = socketUpdateRef.current;
  const workspaceGenerationRef = useRef(0);
  const workspaceGeneration = workspaceGenerationRef.current;
  const applyWorkspace = useEffectEvent(
    (state: Partial<WorkspaceState>): boolean => {
      if (!state.activeWorkspaceId || !state.workspaces) return false;
      const changed =
        workspaceIdRef.current !== null &&
        workspaceIdRef.current !== state.activeWorkspaceId;
      if (changed) workspaceGenerationRef.current += 1;
      workspaceIdRef.current = state.activeWorkspaceId;
      setWorkspaceState({
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: state.workspaces,
      });
      return changed;
    },
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [searchVersion, setSearchVersion] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickerCapabilities, setPickerCapabilities] =
    useState<NativePickerCapabilities>({
      files: { available: false, instanceId: null },
      directory: { available: false, instanceId: null },
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
    const updateVersion = socketUpdateRef.current;
    rpcCall("session.get", {})
      .then((session) => {
        if (active) {
          if (updateVersion === socketUpdateRef.current) {
            applyWorkspace(session);
            setEntries(session.entries);
            setSelectedId(
              resolveSelectedEntryIdAndUpdateUrl(
                readSelectedEntryIdFromUrl(),
                session.entries,
              ),
            );
          }
          setPickerCapabilities(readNativePickerCapabilities(session));
          setServerInstanceId(session.serverIdentity?.instanceId ?? null);
          setIsLoaded(true);
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
    if (socketUpdateRef.current !== sessionRevision) return;
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
    publishServerMessage(message);
    if (message.type === "session:update") {
      socketUpdateRef.current += 1;
      const workspaceChanged = applyWorkspace(message);
      onSessionUpdate(workspaceChanged);
      setSearchVersion((current) => current + 1);
      setEntries(message.entries);
      setSelectedId(
        resolveSelectedEntryIdAndUpdateUrl(
          workspaceChanged ? null : selectedId,
          message.entries,
        ),
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
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws?client=viewer`,
    );
    socket.addEventListener("message", handleSocketMessage);
    return () => socket.close();
  }, []);

  return {
    workspaceState,
    isCurrentWorkspace: (id: string | null) =>
      workspaceIdRef.current === id &&
      workspaceGenerationRef.current === workspaceGeneration,
    entries,
    setEntries,
    selectedId,
    selectEntry,
    reloadVersion,
    searchVersion,
    errorMessage,
    setErrorMessage,
    filePicker: pickerCapabilities.files,
    directoryPicker: pickerCapabilities.directory,
    serverInstanceId,
    isLoaded,
    applyImportedEntries,
  };
}
