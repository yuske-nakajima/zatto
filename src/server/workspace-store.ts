import { readFile } from "node:fs/promises";
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

/** Serializes durable mutations of named file collections. */
export class WorkspaceStore {
  protected document: WorkspaceDocument = {
    version: 2,
    activeWorkspaceId: "default",
    workspaces: [{ id: "default", name: "Default", entries: [] }],
  };
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly filePath: string,
    private readonly write = writeFileAtomically,
  ) {}

  /**
   * Restores all workspaces, migrating single-session files without changing entry IDs.
   * @returns The active collection
   * @throws When reading, validation, or persistence fails
   */
  async load(): Promise<{ entries: Entry[] }> {
    return this.enqueue(async () => {
      if (!(await fileExists(this.filePath))) return this.getSession();
      const document = parseWorkspaceDocument(
        JSON.parse(await readFile(this.filePath, "utf8")),
      );
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
    await this.write(this.filePath, `${JSON.stringify(document, null, 2)}\n`);
    this.document = document;
  }
}
