import { requestSessionChange } from "./session-change.js";
import { workspaceHeaders } from "./workspace-request.js";

/**
 * Binds destructive entry actions to the workspace currently displayed.
 * @param workspaceId - Workspace shown in the browser
 * @param hasEntries - Whether the active collection is nonempty
 * @param reportError - Visible error reporter
 * @returns Individual and confirmed bulk removal actions
 * @throws Never; request failures are reported to the user
 */
export function workspaceEntryActions(
  workspaceId: string | null,
  hasEntries: boolean,
  reportError: (message: string) => void,
) {
  const request: RequestInit = {
    method: "DELETE",
    ...(workspaceId ? { headers: workspaceHeaders(workspaceId) } : {}),
  };
  async function removeEntry(id: string): Promise<void> {
    const removed = await requestSessionChange(
      `/api/session/${encodeURIComponent(id)}`,
      request,
    );
    if (!removed) reportError("Could not remove the entry.");
  }
  async function clearEntries(): Promise<void> {
    if (!hasEntries || !window.confirm("Remove all entries?")) return;
    if (!(await requestSessionChange("/api/session", request)))
      reportError("Could not remove all entries.");
  }
  async function setFavorite(id: string, favorite: boolean): Promise<void> {
    const updated = await requestSessionChange(
      `/api/session/${encodeURIComponent(id)}/favorite`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...workspaceHeaders(workspaceId),
        },
        body: JSON.stringify({ favorite }),
      },
    );
    if (!updated) reportError("Could not update the favorite.");
  }
  return { removeEntry, clearEntries, setFavorite };
}
