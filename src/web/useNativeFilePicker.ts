import { useEffect, useEffectEvent, useState } from "react";
import type { Entry } from "../server/session.js";
import type { FilePickerCapability } from "./useSessionEntries.js";

interface UseNativeFilePickerOptions {
  capability: FilePickerCapability;
  selectEntry: (id: string) => void;
  setErrorMessage: (message: string | null) => void;
}

interface NativeFilePicker {
  isOpen: boolean;
  open: () => Promise<void>;
}

export function useNativeFilePicker({
  capability,
  selectEntry,
  setErrorMessage,
}: UseNativeFilePickerOptions): NativeFilePicker {
  const [isOpen, setIsOpen] = useState(false);

  async function open(): Promise<void> {
    if (!capability.available || !capability.instanceId || isOpen) {
      return;
    }
    setIsOpen(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/session/pick", {
        method: "POST",
        headers: { "x-zatto-instance-id": capability.instanceId },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        cancelled: boolean;
        added: Entry[];
      };
      const firstAddedEntry = result.added[0];
      if (!result.cancelled && firstAddedEntry) {
        selectEntry(firstAddedEntry.id);
      }
    } catch {
      setErrorMessage("Could not open HTML files.");
    } finally {
      setIsOpen(false);
    }
  }

  const openFromShortcut = useEffectEvent(() => {
    void open();
  });

  useEffect(() => {
    if (!capability.available) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        openFromShortcut();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [capability.available]);

  return { isOpen, open };
}
