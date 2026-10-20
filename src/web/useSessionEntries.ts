import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Entry } from "../server/session.js";
import type { WorkspaceState } from "../server/workspace-state.js";
import { rpcCall } from "../shared/rpc-client.js";
import {
  type NativePickerCapabilities,
  readNativePickerCapabilities,
} from "./native-picker-capability.js";
import {
  readRemoteWorkspaceId,
  writeRemoteWorkspaceId,
} from "./remote-access.js";
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
  // 外の端末の画面は、サーバーの選択に追従せず、見ているワークスペースを自分で持つ
  const [isRemote, setIsRemote] = useState(false);
  const remoteRef = useRef(false);
  const viewedWorkspaceIdRef = useRef<string | null>(null);
  const socketUpdateRef = useRef(0);
  const sessionRevision = socketUpdateRef.current;
  const workspaceGenerationRef = useRef(0);
  const workspaceGeneration = workspaceGenerationRef.current;
  const applyWorkspace = useEffectEvent(
    (state: Partial<WorkspaceState>): boolean => {
      if (!state.activeWorkspaceId || !state.workspaces) return false;
      const viewed = viewedWorkspaceIdRef.current;
      const shownId =
        remoteRef.current &&
        viewed !== null &&
        state.workspaces.some(({ id }) => id === viewed)
          ? viewed
          : state.activeWorkspaceId;
      if (remoteRef.current) viewedWorkspaceIdRef.current = shownId;
      const changed =
        workspaceIdRef.current !== null && workspaceIdRef.current !== shownId;
      if (changed) workspaceGenerationRef.current += 1;
      workspaceIdRef.current = shownId;
      setWorkspaceState({
        activeWorkspaceId: shownId,
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
      .then(async (session) => {
        if (session.access === "remote") {
          remoteRef.current = true;
          viewedWorkspaceIdRef.current = readRemoteWorkspaceId();
          setIsRemote(true);
        }
        if (active) {
          if (updateVersion === socketUpdateRef.current) {
            applyWorkspace(session);
            const shownId = workspaceIdRef.current;
            const shownEntries =
              shownId && shownId !== session.activeWorkspaceId
                ? (await rpcCall("workspaces.get", { id: shownId })).entries
                : session.entries;
            if (!active) return;
            setEntries(shownEntries);
            setSelectedId(
              resolveSelectedEntryIdAndUpdateUrl(
                readSelectedEntryIdFromUrl(),
                shownEntries,
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
      const shownId = workspaceIdRef.current;
      if (
        remoteRef.current &&
        shownId &&
        message.activeWorkspaceId !== undefined &&
        shownId !== message.activeWorkspaceId
      ) {
        // 通知は選択中のワークスペースの中身なので、見ているワークスペースは取り直す
        void showWorkspaceEntries(
          shownId,
          workspaceChanged ? null : selectedId,
        );
        return;
      }
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

  async function showWorkspaceEntries(
    id: string,
    requestedId: string | null,
  ): Promise<void> {
    try {
      const workspace = await rpcCall("workspaces.get", { id });
      if (workspaceIdRef.current !== id) return;
      setEntries(workspace.entries);
      setSelectedId(
        resolveSelectedEntryIdAndUpdateUrl(requestedId, workspace.entries),
      );
    } catch {
      setErrorMessage("Could not load the workspace.");
    }
  }

  /** 外の端末の画面で、サーバーの選択を変えずに見るワークスペースを切り替える。 */
  function viewWorkspace(id: string): void {
    if (!remoteRef.current || workspaceIdRef.current === id) return;
    viewedWorkspaceIdRef.current = id;
    writeRemoteWorkspaceId(id);
    workspaceGenerationRef.current += 1;
    workspaceIdRef.current = id;
    setWorkspaceState((current) =>
      current ? { ...current, activeWorkspaceId: id } : current,
    );
    onSessionUpdate(true);
    setSearchVersion((current) => current + 1);
    void showWorkspaceEntries(id, null);
  }

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws?client=viewer`,
    );
    socket.addEventListener("message", handleSocketMessage);
    return () => socket.close();
  }, []);

  return {
    isRemote,
    viewWorkspace,
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
