import { nanoid } from "nanoid";
import type { Entry } from "./session.js";
import { extractTitle, fileExists } from "./session-files.js";

/** Durable addition results for the workspace captured at invocation. */
export interface EntryAddition {
  added: Entry[];
  resolved: Entry[];
  workspaceId: string;
}
/**
 * Builds additions and resolves existing paths without changing List order.
 * @param entries - Existing workspace entries
 * @param inputPaths - Requested absolute paths in display order
 * @param workspaceId - Target workspace identity
 * @returns Candidate entries and detached resolved entries
 * @throws When reading an accessible path fails
 */
export async function prepareEntryAddition(
  entries: Entry[],
  inputPaths: string[],
  workspaceId: string,
) {
  const known = new Map(entries.map((entry) => [entry.absPath, entry]));
  const added: Entry[] = [];
  const resolved: Entry[] = [];
  for (const absPath of new Set(inputPaths)) {
    let entry = known.get(absPath);
    if (!entry && (await fileExists(absPath))) {
      let title: string;
      try {
        title = await extractTitle(absPath);
      } catch (error) {
        throw new Error(
          `Cannot read file ${JSON.stringify(absPath)}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      entry = { id: nanoid(), absPath, title, addedAt: Date.now() };
      added.push(entry);
    }
    if (entry) resolved.push(entry);
  }
  return {
    entries: added.length ? [...entries, ...added] : undefined,
    result: {
      added,
      resolved: structuredClone(resolved),
      workspaceId,
    } satisfies EntryAddition,
  };
}
