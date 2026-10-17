import { type DragEvent, useState } from "react";
import type { Entry } from "../server/session.js";
import { prepareEntryDrag } from "./entry-drag.js";
import { moveEntry } from "./file-panel-model.js";
import { requestSessionChange } from "./session-change.js";
import { workspaceParams } from "./workspace-request.js";

interface EntryReorderingOptions {
  workspaceId?: string | null;
  isCurrentWorkspace?: (id: string | null) => boolean;
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Manages entry drag state and persists reordered session entries.
 *
 * @param options - Session entries and state update functions
 * @returns Drag state and event handlers for the file panel
 */
export function useEntryReordering({
  workspaceId,
  isCurrentWorkspace,
  entries,
  setEntries,
  setErrorMessage,
}: EntryReorderingOptions) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    id: string,
  ): void {
    prepareEntryDrag(event, id);
    setDraggedId(id);
  }

  function resetDragState(): void {
    setDraggedId(null);
    setDropTargetId(null);
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
    const reordered = await requestSessionChange("session.reorder", {
      ids: reorderedEntries.map((entry) => entry.id),
      ...workspaceParams(workspaceId),
    });
    if (
      !reordered &&
      (!isCurrentWorkspace || isCurrentWorkspace(workspaceId ?? null))
    ) {
      setEntries((current) =>
        current === reorderedEntries ? previousEntries : current,
      );
      setErrorMessage("Could not reorder the entries.");
    }
  }

  return {
    draggedId,
    dropTargetId,
    handleDragStart,
    setDropTargetId,
    resetDragState,
    reorderEntries,
  };
}
