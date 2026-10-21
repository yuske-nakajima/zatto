import os from "node:os";
import path from "node:path";
import { writeFileAtomically } from "../shared/atomic-file.js";
import { updateFavorite } from "./favorite-update.js";
import { type EntryAddition, prepareEntryAddition } from "./session-add.js";
import { extractTitle } from "./session-files.js";
import { createImportedEntries } from "./session-import.js";
import { WorkspaceStore } from "./workspace-store.js";

export { extractTitle, fileExists } from "./session-files.js";
/** A registered local file with stable identity and display metadata. */
export interface Entry {
  id: string;
  absPath: string;
  title: string;
  addedAt: number;
  favorite?: boolean;
  /** お気に入りの順。小さいほど前。お気に入りでないエントリは持たない。 */
  favoriteRank?: number;
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
    return (await this.addEntriesWithResults(inputPaths, workspaceId)).added;
  }
  /**
   * Resolves requested paths in the same serialized operation that adds them.
   * @param inputPaths - Absolute file paths in requested order
   * @param workspaceId - Target workspace identity
   * @returns Added and existing entries with the target workspace ID
   * @throws When reading or persistence fails, or the workspace was deleted
   */
  async addEntriesWithResults(
    inputPaths: string[],
    workspaceId = this.activeId(),
  ): Promise<EntryAddition> {
    return this.updateEntries(workspaceId, (entries) =>
      prepareEntryAddition(entries, inputPaths, workspaceId),
    );
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
   * お気に入りだけを並べ替える。List の順は変えない。
   * @param ids - お気に入りの ID。現在のお気に入りを重複なくすべて含む
   * @param workspaceId - 対象のワークスペース
   * @returns ID の集合がお気に入りと一致して保存したか
   * @throws When persistence fails or the workspace no longer exists
   */
  async reorderFavorites(
    ids: string[],
    workspaceId = this.activeId(),
  ): Promise<boolean> {
    return this.updateEntries(workspaceId, (entries) => {
      const favorites = new Set(
        entries.filter((entry) => entry.favorite).map((entry) => entry.id),
      );
      if (
        ids.length !== favorites.size ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !favorites.has(id))
      )
        return { result: false };
      const rank = new Map(ids.map((id, index) => [id, index]));
      return {
        entries: entries.map((entry) =>
          entry.favorite
            ? { ...entry, favoriteRank: rank.get(entry.id) }
            : entry,
        ),
        result: true,
      };
    });
  }
  /**
   * Sets a workspace entry's favorite state without reordering files.
   * @param id - Entry ID
   * @param favorite - Desired state
   * @param workspaceId - Target workspace
   * @returns Whether the entry was missing, unchanged, or updated
   * @throws When persistence fails or the workspace no longer exists
   */
  async setFavorite(
    id: string,
    favorite: boolean,
    workspaceId = this.activeId(),
  ) {
    return this.updateEntries(workspaceId, (entries) =>
      updateFavorite(entries, id, favorite),
    );
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
