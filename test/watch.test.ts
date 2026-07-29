import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import {
  EntryWatcher,
  WATCH_DEBOUNCE_MS,
  type WatcherAdapter,
} from "../src/server/watch.js";

class FakeWatcher extends EventEmitter {
  readonly added: string[][] = [];
  readonly removed: string[][] = [];
  readonly close = vi.fn(async () => {});

  add(paths: string | string[]): this {
    this.added.push(Array.isArray(paths) ? paths : [paths]);
    return this;
  }

  unwatch(paths: string | string[]): this {
    this.removed.push(Array.isArray(paths) ? paths : [paths]);
    return this;
  }
}

function entry(id: string, absPath: string): Entry {
  return {
    id,
    absPath,
    title: `${id}.html`,
    addedAt: 1,
  };
}

describe("EntryWatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("エントリの追加と削除に合わせて監視対象を同期する", () => {
    const fakeWatcher = new FakeWatcher();
    const watcher = new EntryWatcher(vi.fn(), fakeWatcher as WatcherAdapter);
    const firstPath = path.resolve("/tmp/a.html");
    const secondPath = path.resolve("/tmp/b.html");

    watcher.sync([entry("a", firstPath)]);
    watcher.sync([entry("b", secondPath)]);

    expect(fakeWatcher.added).toEqual([[firstPath], [secondPath]]);
    expect(fakeWatcher.removed).toEqual([[firstPath]]);
  });

  test("変更通知を200ms debounceして対象IDを返す", async () => {
    vi.useFakeTimers();
    const fakeWatcher = new FakeWatcher();
    const onFileChanged = vi.fn();
    const watcher = new EntryWatcher(
      onFileChanged,
      fakeWatcher as WatcherAdapter,
    );
    const htmlPath = path.resolve("/tmp/a.html");
    watcher.sync([entry("a", htmlPath)]);

    fakeWatcher.emit("change", htmlPath);
    await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS - 1);
    fakeWatcher.emit("change", htmlPath);
    await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS - 1);
    expect(onFileChanged).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onFileChanged).toHaveBeenCalledOnce();
    expect(onFileChanged).toHaveBeenCalledWith("a");

    await watcher.close();
    expect(fakeWatcher.close).toHaveBeenCalledOnce();
  });
});
