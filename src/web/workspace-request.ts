/** Captures the workspace displayed when an operation starts. */
export function workspaceParams(workspaceId: string | null | undefined): {
  workspaceId?: string;
} {
  return workspaceId ? { workspaceId } : {};
}
