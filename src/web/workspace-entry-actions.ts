import { requestSessionChange } from "./session-change.js";
import { workspaceParams } from "./workspace-request.js";

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
  const params = workspaceParams(workspaceId);
  async function removeEntry(id: string): Promise<void> {
    if (!(await requestSessionChange("session.remove", { ...params, id })))
      reportError("Could not remove the entry.");
  }
  async function clearEntries(): Promise<void> {
    if (!hasEntries || !window.confirm("Remove all entries?")) return;
    if (!(await requestSessionChange("session.clear", params)))
      reportError("Could not remove all entries.");
  }
  async function setFavorite(id: string, favorite: boolean): Promise<void> {
    if (
      !(await requestSessionChange("session.setFavorite", {
        ...params,
        id,
        favorite,
      }))
    )
      reportError("Could not update the favorite.");
  }
  return { removeEntry, clearEntries, setFavorite };
}
