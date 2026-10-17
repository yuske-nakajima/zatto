import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Entry } from "../server/session.js";
import { rpcCall } from "../shared/rpc-client.js";
import type { NativePickerCapability } from "./native-picker-capability.js";
import { workspaceParams } from "./workspace-request.js";

export type DirectoryPickerMode = "direct" | "recursive";
export type NativePickerPending = "files" | "directory" | null;

interface UseNativeEntryPickerOptions {
  workspaceId?: string | null;
  isCurrentWorkspace?: (id: string | null) => boolean;
  fileCapability: NativePickerCapability;
  directoryCapability: NativePickerCapability;
  selectEntry: (id: string) => void;
  setErrorMessage: (message: string | null) => void;
}

interface NativeEntryPicker {
  pending: NativePickerPending;
  isOpen: boolean;
  openFiles: () => Promise<void>;
  openDirectory: (mode: DirectoryPickerMode) => Promise<void>;
}

interface PickerResult {
  cancelled: boolean;
  added: Entry[];
}

/**
 * Coordinates native file and directory pickers through one pending lock.
 *
 * @param options - Picker capabilities and session selection callbacks
 * @returns Native picker actions and their shared pending state
 */
export function useNativeEntryPicker({
  workspaceId,
  isCurrentWorkspace,
  fileCapability,
  directoryCapability,
  selectEntry,
  setErrorMessage,
}: UseNativeEntryPickerOptions): NativeEntryPicker {
  const [pending, setPending] = useState<NativePickerPending>(null);
  const pendingRef = useRef<NativePickerPending>(null);

  async function openFiles(): Promise<void> {
    const request = beginPicker("files", fileCapability);
    if (!request) return;
    try {
      const result = await rpcCall("session.pickFiles", request);
      if (!isCurrentWorkspace || isCurrentWorkspace(workspaceId ?? null))
        selectFirstAddedEntry(result, selectEntry);
    } catch {
      setErrorMessage("Could not open HTML files.");
    } finally {
      finishPicker("files");
    }
  }

  async function openDirectory(mode: DirectoryPickerMode): Promise<void> {
    const request = beginPicker("directory", directoryCapability);
    if (!request) return;
    try {
      const result = await rpcCall("session.pickDirectory", {
        ...request,
        mode,
      });
      if (isCurrentWorkspace && !isCurrentWorkspace(workspaceId ?? null))
        return;
      if (!result.cancelled && result.added.length === 0) {
        setErrorMessage("No HTML files were added from the selected folder.");
      } else {
        if (!isCurrentWorkspace || isCurrentWorkspace(workspaceId ?? null))
          selectFirstAddedEntry(result, selectEntry);
      }
    } catch {
      setErrorMessage("Could not add HTML files from the selected folder.");
    } finally {
      finishPicker("directory");
    }
  }

  function beginPicker(
    kind: Exclude<NativePickerPending, null>,
    capability: NativePickerCapability,
  ): { instanceId: string; workspaceId?: string } | null {
    if (!capability.available || !capability.instanceId || pendingRef.current) {
      return null;
    }
    pendingRef.current = kind;
    setPending(kind);
    setErrorMessage(null);
    return {
      instanceId: capability.instanceId,
      ...workspaceParams(workspaceId),
    };
  }

  function finishPicker(kind: Exclude<NativePickerPending, null>): void {
    if (pendingRef.current !== kind) return;
    pendingRef.current = null;
    setPending(null);
  }

  const openFilesFromShortcut = useEffectEvent(() => void openFiles());
  useEffect(() => {
    if (!fileCapability.available) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        openFilesFromShortcut();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fileCapability.available]);

  return {
    pending,
    isOpen: pending !== null,
    openFiles,
    openDirectory,
  };
}

function selectFirstAddedEntry(
  result: PickerResult,
  selectEntry: (id: string) => void,
): void {
  const firstAddedEntry = result.added[0];
  if (!result.cancelled && firstAddedEntry) selectEntry(firstAddedEntry.id);
}
