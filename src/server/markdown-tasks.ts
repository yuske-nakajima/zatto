import { createHash } from "node:crypto";

/** A task list item located in Markdown source. */
export interface MarkdownTask {
  /** Offset of the character between the brackets. */
  stateOffset: number;
  checked: boolean;
}

const TASK_PATTERN =
  /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)/;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Identifies the exact source a page was rendered from.
 * @param source - Markdown text
 * @returns Content digest
 * @throws Never
 */
export function markdownRevision(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

/**
 * Lists task markers in document order, skipping fenced code blocks at the top level.
 * The renderer compares this list with the checkboxes it emits and disables toggling when they differ.
 * @param source - Markdown text
 * @returns Task markers
 * @throws Never
 */
export function findMarkdownTasks(source: string): MarkdownTask[] {
  const tasks: MarkdownTask[] = [];
  let fence: string | null = null;
  let offset = 0;
  for (const line of source.split(/(?<=\n)/)) {
    const marker = line.match(FENCE_PATTERN)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
    } else if (fence === null) {
      const task = line.match(TASK_PATTERN);
      if (task)
        tasks.push({
          stateOffset: offset + task[1].length + 1,
          checked: task[2] !== " ",
        });
    }
    offset += line.length;
  }
  return tasks;
}

/**
 * Sets one task marker, leaving every other character unchanged.
 * @param source - Markdown text
 * @param index - Zero-based task position in document order
 * @param checked - Requested state
 * @returns Updated text, or null when the task does not exist
 * @throws Never
 */
export function setMarkdownTask(
  source: string,
  index: number,
  checked: boolean,
): string | null {
  const task = findMarkdownTasks(source)[index];
  if (!task) return null;
  if (task.checked === checked) return source;
  return `${source.slice(0, task.stateOffset)}${checked ? "x" : " "}${source.slice(task.stateOffset + 1)}`;
}
