import { useState } from "react";
import type { WorkspaceState } from "../server/workspace-state.js";
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
    url: string,
    method: string,
    name?: string,
  ): Promise<void> {
    setPending(true);
    reportError(null);
    try {
      const response = await fetch(url, {
        method,
        ...(name === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name }),
            }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (method === "POST") {
        const created = (await response.json()) as { id: string };
        const activation = await fetch(
          `/api/workspaces/${encodeURIComponent(created.id)}/activate`,
          { method: "PUT" },
        );
        if (!activation.ok) throw new Error(`HTTP ${activation.status}`);
      }
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
    void change(
      create
        ? "/api/workspaces"
        : `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}`,
      create ? "POST" : "PATCH",
      name.trim(),
    );
  }
  function removeWorkspace(): void {
    if (
      !window.confirm(
        `Delete workspace “${current?.name}”? Its files remain on disk.`,
      )
    )
      return;
    void change(
      `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}`,
      "DELETE",
    );
  }
  return (
    <section className="workspace-controls" aria-label="Workspace controls">
      <label htmlFor="workspace-select">Workspace</label>
      <select
        data-status-description="Switch the shared workspace and restore its files and List order."
        id="workspace-select"
        value={state.activeWorkspaceId}
        disabled={pending}
        onChange={(event) =>
          void change(
            `/api/workspaces/${encodeURIComponent(event.target.value)}/activate`,
            "PUT",
          )
        }
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
