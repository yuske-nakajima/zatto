/**
 * Adds a workspace precondition to a browser request.
 * @param workspaceId - Workspace displayed when the operation started
 * @returns Header fields, or an empty object for servers without workspace metadata
 * @throws Never
 */
export function workspaceHeaders(
  workspaceId: string | null | undefined,
): Record<string, string> {
  return workspaceId ? { "x-zatto-workspace-id": workspaceId } : {};
}
