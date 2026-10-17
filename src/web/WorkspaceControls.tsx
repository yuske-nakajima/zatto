import { useState } from "react";
import type { WorkspaceState } from "../server/workspace-state.js";
import { rpcCall } from "../shared/rpc-client.js";
import "./workspace.css";

interface WorkspaceControlsProps {
  state: WorkspaceState | null;
  reportError: (message: string | null) => void;
}

/**
 * Displays workspace selection and named collection management.
 * @param props - Shared workspace state and error reporter
 * @returns Accessible workspace controls
 * @throws Never; request failures are reported in the viewer
 */
export function WorkspaceControls({
  state,
  reportError,
}: WorkspaceControlsProps) {
  const [pending, setPending] = useState(false);
  if (!state) return null;
  const activeWorkspaceId = state.activeWorkspaceId;
  const current = state.workspaces.find(
    ({ id }) => id === state.activeWorkspaceId,
  );
  async function change(
    action: "create" | "rename" | "activate" | "delete",
    id: string,
    name = "",
  ): Promise<void> {
    setPending(true);
    reportError(null);
    try {
      if (action === "create") {
        const created = await rpcCall("workspaces.create", { name });
        await rpcCall("workspaces.activate", { id: created.id });
      } else if (action === "rename")
        await rpcCall("workspaces.rename", { id, name });
      else if (action === "activate")
        await rpcCall("workspaces.activate", { id });
      else await rpcCall("workspaces.delete", { id });
    } catch {
      reportError("Could not update the workspace.");
    } finally {
      setPending(false);
    }
  }
  function nameWorkspace(create: boolean): void {
    const name = window.prompt(
      create ? "Workspace name" : "Rename workspace",
      create ? "" : current?.name,
    );
    if (name === null) return;
    if (!name.trim() || name.trim().length > 100) {
      reportError("Workspace name must contain 1–100 characters.");
      return;
    }
    void change(create ? "create" : "rename", activeWorkspaceId, name.trim());
  }

  function removeWorkspace(): void {
    if (
      !window.confirm(
        `Delete workspace “${current?.name}”? Its files remain on disk.`,
      )
    )
      return;
    void change("delete", activeWorkspaceId);
  }

  return (
    <section className="workspace-controls" aria-label="Workspace controls">
      <label htmlFor="workspace-select">Workspace</label>
      <select
        data-status-description="Switch the shared workspace and restore its files and List order."
        id="workspace-select"
        value={state.activeWorkspaceId}
        disabled={pending}
        onChange={(event) => void change("activate", event.target.value)}
      >
        {state.workspaces.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <div className="workspace-actions">
        <button
          type="button"
          disabled={pending}
          data-status-description="Create and select an empty named workspace."
          onClick={() => nameWorkspace(true)}
        >
          New workspace
        </button>
        <button
          type="button"
          disabled={pending}
          data-status-description="Rename the selected workspace."
          onClick={() => nameWorkspace(false)}
        >
          Rename
        </button>
        <button
          type="button"
          disabled={pending || state.workspaces.length < 2}
          data-status-description="Delete this workspace after confirmation; keep its files on disk."
          onClick={removeWorkspace}
        >
          Delete
        </button>
      </div>
    </section>
  );
}
