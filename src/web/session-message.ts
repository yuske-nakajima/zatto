import type { Entry, Session } from "../server/session.js";
import type { ServerMessage } from "../shared/protocol.js";
import { selectAvailableEntry } from "./file-panel-model.js";
import { replaceSelectedEntryIdInUrl } from "./selected-entry-url.js";

/**
 * Resolves a usable selection and replaces the URL entry parameter.
 * @param requestedId - Preferred entry ID
 * @param availableEntries - Entries in the displayed workspace
 * @returns The selected ID, or null for an empty collection
 * @throws When browser history cannot be updated
 */
export function resolveSelectedEntryIdAndUpdateUrl(
  requestedId: string | null,
  availableEntries: Entry[],
): string | null {
  const selectedEntryId = selectAvailableEntry(requestedId, availableEntries);
  replaceSelectedEntryIdInUrl(selectedEntryId);
  return selectedEntryId;
}

/**
 * Parses a WebSocket JSON message.
 * @param data - Message payload
 * @returns Parsed message, or null for non-text and malformed JSON
 * @throws Never
 */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    return JSON.parse(data) as ServerMessage;
  } catch {
    return null;
  }
}

/** Session response with optional workspace metadata for compatible clients. */
export interface SessionResponse
  extends Session,
    Partial<import("../server/workspace-state.js").WorkspaceState> {
  filePicker?: { available?: boolean; instanceId?: string };
  directoryPicker?: { available?: boolean; instanceId?: string };
  serverIdentity?: { instanceId?: string };
}
