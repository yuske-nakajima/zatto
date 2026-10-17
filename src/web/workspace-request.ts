/**
 * Targets the workspace displayed when an operation starts.
 * Before the session loads, the empty ID fails server validation and the caller reports the failure.
 */
export function workspaceParams(workspaceId: string | null | undefined): {
  workspaceId: string;
} {
  return { workspaceId: workspaceId ?? "" };
}
