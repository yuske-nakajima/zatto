import { requestSessionChange } from "./session-change.js";

/**
 * Creates an action that confirms and removes folder entries from the session.
 *
 * @param reportError - Receives a user-facing message when the request fails
 * @returns An action accepting entry IDs collected from a directory subtree
 */
export function createFolderSessionRemover(
  reportError: (message: string) => void,
): (ids: string[]) => Promise<void> {
  return (ids) => removeFolderEntriesFromSession(ids, reportError);
}

async function removeFolderEntriesFromSession(
  ids: string[],
  reportError: (message: string) => void,
): Promise<void> {
  const fileLabel = ids.length === 1 ? "file" : "files";
  if (
    ids.length === 0 ||
    !window.confirm(`Remove ${ids.length} ${fileLabel} from this session?`)
  ) {
    return;
  }
  const removed = await requestSessionChange("/api/session/entries", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!removed) {
    reportError("Could not remove the files from the session.");
  }
}
