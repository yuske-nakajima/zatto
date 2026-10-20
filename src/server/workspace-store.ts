import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { writeFileAtomically } from "../shared/atomic-file.js";
import type { Entry } from "./session.js";
import { fileExists } from "./session-files.js";
import {
  parseWorkspaceDocument,
  type Workspace,
  type WorkspaceDocument,
  WorkspaceError,
  type WorkspaceState,
  workspaceName,
} from "./workspace-state.js";

/**
 * ワークスペースの保存先のファイル名。
 * ワークスペースのない版も同じディレクトリーの session.json を読み書きするため、別の名前にして上書きを避ける。
 */
export const WORKSPACE_FILE_NAME = "workspaces.json";
/** 保存のたびに直前の内容を残すディレクトリーの名前と、残す数。 */
export const WORKSPACE_BACKUP_DIRECTORY = "backups";
export const WORKSPACE_BACKUP_LIMIT = 20;

/**
 * 保存先のファイルを返す。
 * @param sessionFilePath - session.json の場所（`ZATTO_SESSION_FILE` で変えられる）
 * @returns 同じディレクトリーの workspaces.json
 */
export function workspaceFilePath(sessionFilePath: string): string {
  return path.join(path.dirname(sessionFilePath), WORKSPACE_FILE_NAME);
}

/** Serializes durable mutations of named file collections. */
export class WorkspaceStore {
  protected document: WorkspaceDocument = {
    version: 2,
    activeWorkspaceId: "default",
    workspaces: [{ id: "default", name: "Default", entries: [] }],
  };
  private pending: Promise<unknown> = Promise.resolve();
  private readonly filePath: string;
  /** 保存済みの内容。次の保存で、これをバックアップとして残す。 */
  private saved: string | null = null;
  /**
   * @param legacyFilePath - session.json の場所。workspaces.json がないときだけ、ここから読み込んで移す
   * @param write - 原子的な書き込み
   */
  constructor(
    private readonly legacyFilePath: string,
    private readonly write = writeFileAtomically,
  ) {
    this.filePath = workspaceFilePath(legacyFilePath);
  }

  /**
   * Restores all workspaces, migrating single-session files without changing entry IDs.
   * @returns The active collection
   * @throws When reading, validation, or persistence fails
   */
  async load(): Promise<{ entries: Entry[] }> {
    return this.enqueue(async () => {
      const source = (await fileExists(this.filePath))
        ? this.filePath
        : (await fileExists(this.legacyFilePath))
          ? this.legacyFilePath
          : null;
      if (!source) return this.getSession();
      const text = await readFile(source, "utf8");
      if (source === this.filePath) this.saved = text;
      const document = parseWorkspaceDocument(JSON.parse(text));
      for (const workspace of document.workspaces) {
        const existing = await Promise.all(
          workspace.entries.map(async (entry) =>
            (await fileExists(entry.absPath)) ? entry : null,
          ),
        );
        workspace.entries = existing.filter(
          (entry): entry is Entry => entry !== null,
        );
      }
      await this.commit(document);
      return this.getSession();
    });
  }

  /** Returns a detached copy of the active collection. */
  getSession(): { entries: Entry[] } {
    return { entries: structuredClone(this.active().entries) };
  }
  /** Returns workspace names and the shared active selection. */
  getWorkspaceState(): WorkspaceState {
    return {
      activeWorkspaceId: this.document.activeWorkspaceId,
      workspaces: this.document.workspaces.map(({ id, name }) => ({
        id,
        name,
      })),
    };
  }
  /**
   * Returns a detached copy of any workspace without changing the active selection.
   * @param id - Workspace ID
   * @returns Workspace name and ordered entries
   * @throws WorkspaceError when the ID does not exist
   */
  getWorkspace(id: string): Workspace {
    return structuredClone(this.requireWorkspace(id));
  }
  /** Whether any workspace contains the entry. */
  hasEntry(id: string): boolean {
    return this.document.workspaces.some((workspace) =>
      workspace.entries.some((entry) => entry.id === id),
    );
  }
  /** Returns an entry in the active collection. */
  getEntry(id: string): Entry | undefined {
    const entry = this.active().entries.find((entry) => entry.id === id);
    return entry ? { ...entry } : undefined;
  }
  /** どのワークスペースのエントリでも返す。外の端末は選択中でないワークスペースも見るため使う。 */
  findEntry(id: string): Entry | undefined {
    for (const workspace of this.document.workspaces) {
      const entry = workspace.entries.find((item) => item.id === id);
      if (entry) return { ...entry };
    }
    return undefined;
  }

  /**
   * Creates an empty named workspace without switching selection.
   * @param name - Workspace name
   * @returns Created workspace identity
   * @throws When the name or persistence is invalid
   */
  async createWorkspace(name: string) {
    const workspace: Workspace = {
      id: nanoid(),
      name: workspaceName(name),
      entries: [],
    };
    return this.enqueue(async () => {
      await this.commit({
        ...this.document,
        workspaces: [...this.document.workspaces, workspace],
      });
      return { id: workspace.id, name: workspace.name };
    });
  }
  /**
   * Persists the shared active workspace selection.
   * @param id - Existing workspace ID
   * @returns Nothing
   * @throws When the ID or persistence is invalid
   */
  async switchWorkspace(id: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireWorkspace(id);
      await this.commit({ ...this.document, activeWorkspaceId: id });
    });
  }
  /**
   * Updates a workspace name while preserving its entries and ID.
   * @param id - Workspace ID
   * @param name - Display name
   * @returns Nothing
   * @throws When the ID, name, or persistence is invalid
   */
  async renameWorkspace(id: string, name: string): Promise<void> {
    const normalized = workspaceName(name);
    return this.enqueue(async () => {
      this.requireWorkspace(id);
      await this.commit({
        ...this.document,
        workspaces: this.document.workspaces.map((workspace) =>
          workspace.id === id ? { ...workspace, name: normalized } : workspace,
        ),
      });
    });
  }
  /**
   * Removes a workspace, selecting the first remaining workspace when necessary.
   * @param id - Workspace ID explicitly selected for deletion
   * @returns Nothing
   * @throws When deleting the last workspace, or on invalid ID or persistence failure
   */
  async deleteWorkspace(id: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireWorkspace(id);
      if (this.document.workspaces.length === 1)
        throw new WorkspaceError("Keep at least one workspace.");
      const workspaces = this.document.workspaces.filter(
        (workspace) => workspace.id !== id,
      );
      await this.commit({
        ...this.document,
        workspaces,
        activeWorkspaceId:
          this.document.activeWorkspaceId === id
            ? workspaces[0].id
            : this.document.activeWorkspaceId,
      });
    });
  }

  protected async updateEntries<T>(
    id: string,
    update: (
      entries: Entry[],
    ) =>
      | Promise<{ entries?: Entry[]; result: T }>
      | { entries?: Entry[]; result: T },
  ): Promise<T> {
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(id);
      const { entries, result } = await update(
        structuredClone(workspace.entries),
      );
      if (entries)
        await this.commit({
          ...this.document,
          workspaces: this.document.workspaces.map((item) =>
            item.id === id ? { ...item, entries } : item,
          ),
        });
      return result;
    });
  }
  protected activeId(): string {
    return this.document.activeWorkspaceId;
  }
  private active(): Workspace {
    return this.requireWorkspace(this.activeId());
  }
  private requireWorkspace(id: string): Workspace {
    const workspace = this.document.workspaces.find((item) => item.id === id);
    if (!workspace) throw new WorkspaceError("Workspace no longer exists.");
    return workspace;
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => undefined);
    return next;
  }
  private async commit(document: WorkspaceDocument): Promise<void> {
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const previous = this.saved;
    await this.write(this.filePath, text);
    this.document = document;
    this.saved = text;
    if (previous !== null && previous !== text) await this.backup(previous);
  }
  /**
   * 直前の内容を backups/ に残し、上限を超えた古いものから消す。
   * 本体の保存はすでに終わっているため、バックアップの失敗で操作を失敗にしない。
   */
  private async backup(text: string): Promise<void> {
    const directory = path.join(
      path.dirname(this.filePath),
      WORKSPACE_BACKUP_DIRECTORY,
    );
    try {
      const stamp = new Date().toISOString().replaceAll(":", "-");
      // 注入された書き込みは本体の保存だけに使う
      await writeFileAtomically(
        path.join(directory, `workspaces-${stamp}-${nanoid(6)}.json`),
        text,
      );
      const backups = (await readdir(directory))
        .filter((name) => /^workspaces-.+\.json$/.test(name))
        .sort();
      await Promise.all(
        backups
          .slice(0, Math.max(0, backups.length - WORKSPACE_BACKUP_LIMIT))
          .map((name) => rm(path.join(directory, name), { force: true })),
      );
    } catch {
      // バックアップは保険なので、書けなくても本体の保存を優先する
    }
  }
}
