import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import { writeFileAtomically } from "../shared/atomic-file.js";
import { createImportedEntries } from "./session-import.js";

export type Entry = {
  id: string;
  absPath: string;
  title: string;
  addedAt: number;
};

export type Session = {
  entries: Entry[];
};

type PersistedSession = {
  entries?: Entry[];
};

export const DEFAULT_SESSION_FILE = path.join(
  os.homedir(),
  ".config",
  "zatto",
  "session.json",
);

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function extractTitle(absPath: string): Promise<string> {
  const html = await readFile(absPath, "utf8");
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch?.[1]?.replace(/\s+/g, " ").trim();
  return rawTitle && rawTitle.length > 0 ? rawTitle : path.basename(absPath);
}

export class SessionStore {
  private session: Session = { entries: [] };

  constructor(
    private readonly sessionFilePath = DEFAULT_SESSION_FILE,
    private readonly writeSessionFile = writeFileAtomically,
  ) {}

  async load(): Promise<Session> {
    if (!(await fileExists(this.sessionFilePath))) {
      this.session = { entries: [] };
      return this.getSession();
    }
    const fileContent = await readFile(this.sessionFilePath, "utf8");
    const parsed = JSON.parse(fileContent) as PersistedSession;
    const entries = parsed.entries ?? [];
    const existingEntries: Entry[] = [];
    for (const entry of entries) {
      if (await fileExists(entry.absPath)) {
        existingEntries.push(entry);
      }
    }
    const nextSession = { entries: existingEntries };
    await this.persistSession(nextSession);
    this.session = nextSession;
    return this.getSession();
  }

  getSession(): Session {
    return {
      entries: [...this.session.entries],
    };
  }

  getEntry(id: string): Entry | undefined {
    return this.session.entries.find((entry) => entry.id === id);
  }

  async addEntries(inputPaths: string[]): Promise<Entry[]> {
    const addedEntries: Entry[] = [];
    const knownPaths = new Set(
      this.session.entries.map((entry) => entry.absPath),
    );
    for (const absPath of inputPaths) {
      if (knownPaths.has(absPath)) continue;
      if (!(await fileExists(absPath))) {
        continue;
      }
      const entry: Entry = {
        id: nanoid(),
        absPath,
        title: await extractTitle(absPath),
        addedAt: Date.now(),
      };
      addedEntries.push(entry);
      knownPaths.add(absPath);
    }
    if (addedEntries.length > 0) {
      const nextSession = {
        entries: [...this.session.entries, ...addedEntries],
      };
      await this.persistSession(nextSession);
      this.session = nextSession;
    }
    return addedEntries;
  }

  async replaceEntries(inputPaths: string[]): Promise<Session> {
    const entries = await createImportedEntries(inputPaths, extractTitle);
    const nextSession = { entries };
    await this.persistSession(nextSession);
    this.session = nextSession;
    return this.getSession();
  }

  /**
   * Adds validated unregistered paths while preserving existing entries.
   *
   * @param inputPaths - Absolute HTML paths in import order
   * @returns The complete merged session
   * @throws {SessionImportValidationError} When any path cannot be imported
   */
  async mergeEntries(inputPaths: string[]): Promise<Session> {
    const importedEntries = await createImportedEntries(
      inputPaths,
      extractTitle,
    );
    const knownPaths = new Set(
      this.session.entries.map((entry) => path.resolve(entry.absPath)),
    );
    const newEntries = importedEntries.filter(
      (entry) => !knownPaths.has(entry.absPath),
    );
    if (newEntries.length === 0) return this.getSession();
    const nextSession = {
      entries: [...this.session.entries, ...newEntries],
    };
    await this.persistSession(nextSession);
    this.session = nextSession;
    return this.getSession();
  }

  async removeEntry(id: string): Promise<boolean> {
    const nextEntries = this.session.entries.filter((entry) => entry.id !== id);
    if (nextEntries.length === this.session.entries.length) {
      return false;
    }
    const nextSession = { entries: nextEntries };
    await this.persistSession(nextSession);
    this.session = nextSession;
    return true;
  }

  /**
   * Removes a complete set of known entries in one persisted session update.
   *
   * @param ids - Unique, non-empty entry IDs to remove
   * @returns Whether every ID was valid and the entries were removed
   * @throws When session persistence fails
   */
  async removeEntries(ids: string[]): Promise<boolean> {
    if (
      ids.length === 0 ||
      ids.some((id) => id.length === 0) ||
      new Set(ids).size !== ids.length
    ) {
      return false;
    }
    const entriesById = new Set(this.session.entries.map((entry) => entry.id));
    if (ids.some((id) => !entriesById.has(id))) {
      return false;
    }
    const idsToRemove = new Set(ids);
    const nextSession = {
      entries: this.session.entries.filter(
        (entry) => !idsToRemove.has(entry.id),
      ),
    };
    await this.persistSession(nextSession);
    this.session = nextSession;
    return true;
  }

  async reorderEntries(ids: string[]): Promise<boolean> {
    if (
      ids.length !== this.session.entries.length ||
      new Set(ids).size !== ids.length
    ) {
      return false;
    }
    const entriesById = new Map(
      this.session.entries.map((entry) => [entry.id, entry]),
    );
    const reorderedEntries: Entry[] = [];
    for (const id of ids) {
      const entry = entriesById.get(id);
      if (!entry) {
        return false;
      }
      reorderedEntries.push(entry);
    }
    const nextSession = { entries: reorderedEntries };
    await this.persistSession(nextSession);
    this.session = nextSession;
    return true;
  }

  async clear(): Promise<void> {
    if (this.session.entries.length === 0) {
      return;
    }
    const nextSession: Session = { entries: [] };
    await this.persistSession(nextSession);
    this.session = nextSession;
  }

  private async persistSession(session: Session): Promise<void> {
    await this.writeSessionFile(
      this.sessionFilePath,
      `${JSON.stringify(session, null, 2)}\n`,
    );
  }
}
