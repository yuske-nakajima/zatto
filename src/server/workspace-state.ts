import type { Entry } from "./session.js";

/** Identifies a named collection of files. */
export interface WorkspaceSummary {
  id: string;
  name: string;
}
/** Workspace selection and names shared by connected clients. */
export interface WorkspaceState {
  activeWorkspaceId: string;
  workspaces: WorkspaceSummary[];
}
/** Persisted workspace with its ordered file entries. */
export interface Workspace extends WorkspaceSummary {
  entries: Entry[];
}
/** Versioned durable workspace document. */
export interface WorkspaceDocument {
  version: 2;
  activeWorkspaceId: string;
  workspaces: Workspace[];
}
/** A rejected workspace operation that callers can report as a conflict. */
export class WorkspaceError extends Error {}

/**
 * Validates and trims a user-facing workspace name.
 * @param value - Requested name
 * @returns A nonempty name with at most 100 characters
 * @throws WorkspaceError for invalid names
 */
export function workspaceName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new WorkspaceError("Workspace name must contain 1–100 characters.");
  }
  return value.trim();
}

/**
 * Reads a workspace document or migrates the single-session representation.
 * @param value - Parsed JSON
 * @returns Validated workspace document
 * @throws WorkspaceError if the stored structure is invalid
 */
export function parseWorkspaceDocument(value: unknown): WorkspaceDocument {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WorkspaceError("Invalid workspace document.");
  const candidate = value as Partial<WorkspaceDocument> & { entries?: unknown };
  const workspaces =
    candidate.version === undefined
      ? [{ id: "default", name: "Default", entries: candidate.entries ?? [] }]
      : candidate.workspaces;
  const activeWorkspaceId =
    candidate.version === undefined ? "default" : candidate.activeWorkspaceId;
  if (
    (candidate.version !== undefined && candidate.version !== 2) ||
    (candidate.version === undefined &&
      (candidate.workspaces !== undefined ||
        candidate.activeWorkspaceId !== undefined)) ||
    !Array.isArray(workspaces) ||
    !workspaces.length
  ) {
    throw new WorkspaceError("Invalid workspace document.");
  }
  const ids = new Set<string>();
  for (const workspace of workspaces) {
    if (
      !workspace ||
      typeof workspace.id !== "string" ||
      !workspace.id ||
      ids.has(workspace.id)
    )
      throw new WorkspaceError("Invalid workspace identifier.");
    ids.add(workspace.id);
    workspaceName(workspace.name);
    if (
      !Array.isArray(workspace.entries) ||
      workspace.entries.some(
        (entry: Entry) =>
          !entry ||
          typeof entry.id !== "string" ||
          !entry.id ||
          typeof entry.absPath !== "string" ||
          !entry.absPath ||
          typeof entry.title !== "string" ||
          typeof entry.addedAt !== "number" ||
          !Number.isFinite(entry.addedAt),
      )
    )
      throw new WorkspaceError("Invalid workspace entries.");
    const entryIds = workspace.entries.map((entry: Entry) => entry.id);
    const entryPaths = workspace.entries.map((entry: Entry) => entry.absPath);
    if (
      new Set(entryIds).size !== entryIds.length ||
      new Set(entryPaths).size !== entryPaths.length
    )
      throw new WorkspaceError("Duplicate workspace entries.");
  }
  if (typeof activeWorkspaceId !== "string" || !ids.has(activeWorkspaceId))
    throw new WorkspaceError("Invalid active workspace.");
  return {
    version: 2,
    activeWorkspaceId,
    workspaces: workspaces as Workspace[],
  };
}
