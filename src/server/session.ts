import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import { writeFileAtomically } from "../shared/atomic-file.js";
import { extractTitle, fileExists } from "./session-files.js";
import { createImportedEntries } from "./session-import.js";
import { WorkspaceStore } from "./workspace-store.js";

export { extractTitle, fileExists } from "./session-files.js";
/** A registered local file with stable identity and display metadata. */
export interface Entry {
  id: string;
  absPath: string;
  title: string;
  addedAt: number;
}
/** Ordered entries belonging to the active workspace. */
export interface Session {
  entries: Entry[];
}
/** Default durable workspace storage location. */
export const DEFAULT_SESSION_FILE = path.join(
  os.homedir(),
  ".config",
  "zatto",
  "session.json",
);

/** Maintains files in named workspaces with serialized, atomic persistence. */
export class SessionStore extends WorkspaceStore {
  constructor(
    sessionFilePath = DEFAULT_SESSION_FILE,
    writeSessionFile = writeFileAtomically,
  ) {
    super(sessionFilePath, writeSessionFile);
  }

  /**
   * Adds accessible paths to the workspace selected when the operation begins.
   * @param inputPaths - Absolute file paths
   * @param workspaceId - Target workspace ID
   * @returns Added entries
   * @throws When reading or persistence fails, or the workspace was deleted
   */
  async addEntries(
    inputPaths: string[],
    workspaceId = this.activeId(),
  ): Promise<Entry[]> {
    return this.updateEntries(workspaceId, async (entries) => {
      const known = new Set(entries.map((entry) => entry.absPath));
      const added: Entry[] = [];
      for (const absPath of inputPaths) {
        if (known.has(absPath) || !(await fileExists(absPath))) continue;
        added.push({
          id: nanoid(),
          absPath,
          title: await extractTitle(absPath),
          addedAt: Date.now(),
        });
        known.add(absPath);
      }
      return {
        entries: added.length ? [...entries, ...added] : undefined,
        result: added,
      };
    });
  }
  /**
   * Replaces a workspace with validated imported files.
   * @param inputPaths - Ordered absolute HTML paths
   * @param workspaceId - Target workspace ID
   * @returns Replaced collection
   * @throws When validation or persistence fails
   */
  async replaceEntries(
    inputPaths: string[],
    workspaceId = this.activeId(),
  ): Promise<Session> {
    return this.updateEntries(workspaceId, async () => {
      const entries = await createImportedEntries(inputPaths, extractTitle);
      return { entries, result: { entries: structuredClone(entries) } };
    });
  }
  /**
   * Adds validated unregistered paths while preserving existing order.
   * @param inputPaths - Absolute HTML paths in import order
   * @param workspaceId - Target workspace ID
   * @returns Complete merged collection
   * @throws When validation or persistence fails
   */
  async mergeEntries(
    inputPaths: string[],
    workspaceId = this.activeId(),
  ): Promise<Session> {
    return this.updateEntries(workspaceId, async (entries) => {
      const imported = await createImportedEntries(inputPaths, extractTitle);
      const known = new Set(
        entries.map((entry) => path.resolve(entry.absPath)),
      );
      const added = imported.filter((entry) => !known.has(entry.absPath));
      const merged = [...entries, ...added];
      return {
        entries: added.length ? merged : undefined,
        result: { entries: structuredClone(merged) },
      };
    });
  }
  /**
   * Removes an entry from its workspace without deleting its file.
   * @param id - Entry ID
   * @param workspaceId - Target workspace ID
   * @returns Whether the entry existed
   * @throws When persistence fails
   */
  async removeEntry(
    id: string,
    workspaceId = this.activeId(),
  ): Promise<boolean> {
    return this.removeEntries([id], workspaceId);
  }
  /**
   * Removes a complete set of known entries in one durable update.
   * @param ids - Unique, nonempty entry IDs
   * @param workspaceId - Target workspace ID
   * @returns Whether every ID was valid and removed
   * @throws When persistence fails
   */
  async removeEntries(
    ids: string[],
    workspaceId = this.activeId(),
  ): Promise<boolean> {
    return this.updateEntries(workspaceId, (entries) => {
      const known = new Set(entries.map((entry) => entry.id));
      if (
        !ids.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !known.has(id))
      )
        return { result: false };
      const removed = new Set(ids);
      return {
        entries: entries.filter((entry) => !removed.has(entry.id)),
        result: true,
      };
    });
  }
  /**
   * Persists the exact List order of a workspace.
   * @param ids - All entry IDs in desired order
   * @param workspaceId - Target workspace ID
   * @returns Whether IDs form a complete permutation
   * @throws When persistence fails
   */
  async reorderEntries(
    ids: string[],
    workspaceId = this.activeId(),
  ): Promise<boolean> {
    return this.updateEntries(workspaceId, (entries) => {
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      if (
        ids.length !== entries.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !byId.has(id))
      )
        return { result: false };
      return { entries: ids.map((id) => byId.get(id) as Entry), result: true };
    });
  }
  /**
   * Clears the target workspace without deleting files.
   * @param workspaceId - Target workspace ID
   * @returns Nothing
   * @throws When persistence fails
   */
  async clear(workspaceId = this.activeId()): Promise<void> {
    return this.updateEntries(workspaceId, (entries) => ({
      entries: entries.length ? [] : undefined,
      result: undefined,
    }));
  }
}
