import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";

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

  constructor(private readonly sessionFilePath = DEFAULT_SESSION_FILE) {}

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

    this.session = { entries: existingEntries };
    await this.persist();
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

    for (const absPath of inputPaths) {
      if (this.session.entries.some((entry) => entry.absPath === absPath)) {
        continue;
      }
      if (!(await fileExists(absPath))) {
        continue;
      }

      const entry: Entry = {
        id: nanoid(),
        absPath,
        title: await extractTitle(absPath),
        addedAt: Date.now(),
      };
      this.session.entries.push(entry);
      addedEntries.push(entry);
    }

    if (addedEntries.length > 0) {
      await this.persist();
    }

    return addedEntries;
  }

  async removeEntry(id: string): Promise<boolean> {
    const nextEntries = this.session.entries.filter((entry) => entry.id !== id);
    if (nextEntries.length === this.session.entries.length) {
      return false;
    }

    this.session = { entries: nextEntries };
    await this.persist();
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

    this.session = { entries: reorderedEntries };
    await this.persist();
    return true;
  }

  async clear(): Promise<void> {
    if (this.session.entries.length === 0) {
      return;
    }

    this.session = { entries: [] };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.sessionFilePath), { recursive: true });
    await writeFile(
      this.sessionFilePath,
      `${JSON.stringify(this.session, null, 2)}\n`,
      "utf8",
    );
  }
}
