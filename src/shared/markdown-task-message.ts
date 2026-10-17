/** Message a Markdown preview frame posts to the viewer when a task checkbox changes. */
export interface MarkdownTaskRequest {
  type: typeof MARKDOWN_TASK_MESSAGE.request;
  entryId: string;
  index: number;
  checked: boolean;
  revision: string;
}

/** Viewer reply; the frame reloads when the change was not saved. */
export interface MarkdownTaskResult {
  type: typeof MARKDOWN_TASK_MESSAGE.result;
  ok: boolean;
  revision?: string;
}

export const MARKDOWN_TASK_MESSAGE = {
  request: "zatto:markdown-task",
  result: "zatto:markdown-task-result",
} as const;

/**
 * Validates an untrusted frame message.
 * @param value - Posted message data
 * @returns Whether it is a task change request
 * @throws Never
 */
export function isMarkdownTaskRequest(
  value: unknown,
): value is MarkdownTaskRequest {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<MarkdownTaskRequest>;
  return (
    message.type === MARKDOWN_TASK_MESSAGE.request &&
    typeof message.entryId === "string" &&
    message.entryId.length > 0 &&
    Number.isInteger(message.index) &&
    (message.index ?? -1) >= 0 &&
    typeof message.checked === "boolean" &&
    typeof message.revision === "string" &&
    message.revision.length > 0
  );
}
