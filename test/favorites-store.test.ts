import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SessionStore } from "../src/server/session.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

let dir: string;
let file: string;
let paths: string[];
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-favorites-"));
  file = path.join(dir, "session.json");
  paths = ["first.html", "second.html"].map((name) => path.join(dir, name));
  await Promise.all(
    paths.map((file) => writeFile(file, "<title>Sample</title>")),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
test("favorites survive restart without changing List order and remain scoped to each workspace", async () => {
  const store = new SessionStore(file);
  await store.load();
  const entries = await store.addEntries(paths);
  await store.setFavorite(entries[1].id, true);
  expect(store.getSession().entries.map(({ id }) => id)).toEqual(
    entries.map(({ id }) => id),
  );
  const other = await store.createWorkspace("Other");
  await store.switchWorkspace(other.id);
  const [copy] = await store.addEntries([paths[1]]);
  expect(store.getEntry(copy.id)?.favorite).toBeUndefined();
  const restored = new SessionStore(file);
  await restored.load();
  await restored.switchWorkspace("default");
  expect(
    restored.getSession().entries.map(({ favorite }) => Boolean(favorite)),
  ).toEqual([false, true]);
  await restored.reorderEntries(entries.map(({ id }) => id).reverse());
  expect(restored.getSession().entries[0]).toMatchObject({
    id: entries[1].id,
    favorite: true,
  });
});
test("explicit updates are idempotent and failed persistence keeps memory and disk intact", async () => {
  let fail = false;
  const write = vi.fn(async (file: string, content: string) => {
    if (fail) throw new Error("write failed");
    await writeFileAtomically(file, content);
  });
  const store = new SessionStore(file, write);
  await store.load();
  const [entry] = await store.addEntries(paths);
  write.mockClear();
  expect(await store.setFavorite(entry.id, false)).toBe("unchanged");
  expect(await store.setFavorite("missing", true)).toBe("missing");
  expect(write).not.toHaveBeenCalled();
  expect(await store.setFavorite(entry.id, true)).toBe("updated");
  const before = await readFile(file, "utf8");
  write.mockClear();
  expect(await store.setFavorite(entry.id, true)).toBe("unchanged");
  expect(write).not.toHaveBeenCalled();
  fail = true;
  await expect(store.setFavorite(entry.id, false)).rejects.toThrow(
    "write failed",
  );
  expect(store.getEntry(entry.id)?.favorite).toBe(true);
  expect(await readFile(file, "utf8")).toBe(before);
});
test("concurrent favorite and entry updates retain all changes and use the original workspace", async () => {
  const store = new SessionStore(file);
  await store.load();
  const [entry] = await store.addEntries([paths[0]]);
  const other = await store.createWorkspace("Other");
  await Promise.all([
    store.setFavorite(entry.id, true),
    store.addEntries([paths[1]]),
    store.switchWorkspace(other.id),
  ]);
  expect(store.getSession().entries).toEqual([]);
  await store.switchWorkspace("default");
  expect(store.getSession().entries.map(({ absPath }) => absPath)).toEqual(
    paths,
  );
  expect(store.getEntry(entry.id)?.favorite).toBe(true);
});
test("legacy entries default to unstarred; merge preserves stars while replace and re-add reset them", async () => {
  await writeFile(
    file,
    JSON.stringify({
      entries: [
        { id: "legacy", absPath: paths[0], title: "Legacy", addedAt: 1 },
      ],
    }),
  );
  const store = new SessionStore(file);
  await store.load();
  expect(store.getEntry("legacy")?.favorite).toBeUndefined();
  await store.setFavorite("legacy", true);
  await store.mergeEntries(paths);
  expect(store.getEntry("legacy")?.favorite).toBe(true);
  await store.removeEntry("legacy");
  const [added] = await store.addEntries([paths[0]]);
  expect(added.favorite).toBeUndefined();
  await store.setFavorite(added.id, true);
  await store.replaceEntries(paths);
  expect(store.getSession().entries.every(({ favorite }) => !favorite)).toBe(
    true,
  );
});
test("stored nonboolean favorite flags are rejected without overwriting the file", async () => {
  const document = JSON.stringify({
    version: 2,
    activeWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        entries: [
          {
            id: "bad",
            absPath: paths[0],
            title: "Bad",
            addedAt: 1,
            favorite: "yes",
          },
        ],
      },
    ],
  });
  await writeFile(file, document);
  await expect(new SessionStore(file).load()).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe(document);
});
