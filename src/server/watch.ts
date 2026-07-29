import path from "node:path";
import chokidar from "chokidar";
import type { Entry } from "./session.js";

export const WATCH_DEBOUNCE_MS = 200;

export type WatcherAdapter = {
  add(paths: string | string[]): unknown;
  unwatch(paths: string | string[]): unknown;
  on(event: "change", listener: (changedPath: string) => void): unknown;
  close(): Promise<void>;
};

export class EntryWatcher {
  private readonly entryIdByPath = new Map<string, string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly onFileChanged: (id: string) => void,
    private readonly watcher: WatcherAdapter = chokidar.watch([], {
      ignoreInitial: true,
    }),
  ) {
    this.watcher.on("change", (changedPath) => {
      this.handleChange(path.resolve(changedPath));
    });
  }

  sync(entries: Entry[]): void {
    const nextEntryIdByPath = new Map(
      entries.map((entry) => [path.resolve(entry.absPath), entry.id]),
    );
    const addedPaths = [...nextEntryIdByPath.keys()].filter(
      (entryPath) => !this.entryIdByPath.has(entryPath),
    );
    const removedPaths = [...this.entryIdByPath.keys()].filter(
      (entryPath) => !nextEntryIdByPath.has(entryPath),
    );

    if (addedPaths.length > 0) {
      this.watcher.add(addedPaths);
    }
    if (removedPaths.length > 0) {
      this.watcher.unwatch(removedPaths);
    }

    for (const removedPath of removedPaths) {
      const removedId = this.entryIdByPath.get(removedPath);
      if (removedId) {
        this.clearDebounce(removedId);
      }
    }

    this.entryIdByPath.clear();
    for (const [entryPath, id] of nextEntryIdByPath) {
      this.entryIdByPath.set(entryPath, id);
    }
  }

  async close(): Promise<void> {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    await this.watcher.close();
  }

  private handleChange(changedPath: string): void {
    const id = this.entryIdByPath.get(changedPath);
    if (!id) {
      return;
    }

    this.clearDebounce(id);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(id);
      this.onFileChanged(id);
    }, WATCH_DEBOUNCE_MS);
    this.debounceTimers.set(id, timer);
  }

  private clearDebounce(id: string): void {
    const timer = this.debounceTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(id);
    }
  }
}
