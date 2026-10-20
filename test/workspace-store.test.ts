import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { SessionStore } from "../src/server/session.js";
import { workspaceFilePath } from "../src/server/workspace-store.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

let dir: string;
let file: string;
let paths: string[];
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-workspaces-"));
  file = path.join(dir, "session.json");
  paths = ["one.html", "two.html"].map((name) => path.join(dir, name));
  await Promise.all(paths.map((p) => writeFile(p, `<title>${p}</title>`)));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("migrates legacy entries into Default and restores workspace order after restart", async () => {
  const legacy = {
    id: "legacy",
    absPath: paths[0],
    title: "Legacy",
    addedAt: 1,
  };
  await writeFile(file, JSON.stringify({ entries: [legacy] }));
  const store = new SessionStore(file);
  await store.load();
  const original = store.getWorkspaceState().activeWorkspaceId;
  expect(store.getWorkspaceState().workspaces).toEqual([
    { id: original, name: "Default" },
  ]);
  expect(store.getSession().entries).toEqual([legacy]);
  const work = await store.createWorkspace("Work");
  await store.switchWorkspace(work.id);
  const entries = await store.addEntries(paths);
  await store.reorderEntries(entries.map((entry) => entry.id).reverse());
  await store.switchWorkspace(original);
  expect(store.getSession().entries).toEqual([legacy]);
  await store.switchWorkspace(work.id);
  const restored = new SessionStore(file);
  await restored.load();
  expect(restored.getWorkspaceState()).toEqual(store.getWorkspaceState());
  expect(restored.getSession().entries).toEqual([...entries].reverse());
});

test("serializes concurrent entry writes and retains their target across switching", async () => {
  const store = new SessionStore(file);
  await store.load();
  const original = store.getWorkspaceState().activeWorkspaceId;
  const other = await store.createWorkspace("Other");
  await Promise.all([
    store.addEntries([paths[0]]),
    store.addEntries([paths[1]]),
    store.switchWorkspace(other.id),
  ]);
  expect(store.getSession().entries).toEqual([]);
  await store.switchWorkspace(original);
  expect(store.getSession().entries.map((entry) => entry.absPath)).toEqual(
    paths,
  );
});

test("workspace failures preserve memory and disk; deleting the last workspace is rejected", async () => {
  let fail = false;
  const store = new SessionStore(file, async (target, content) => {
    if (fail) throw new Error("write failed");
    await writeFileAtomically(target, content);
  });
  await store.load();
  const original = store.getWorkspaceState().activeWorkspaceId;
  await store.addEntries(paths);
  const before = await readFile(workspaceFilePath(file), "utf8");
  fail = true;
  await expect(store.createWorkspace("Other")).rejects.toThrow("write failed");
  expect(await readFile(workspaceFilePath(file), "utf8")).toBe(before);
  expect(store.getWorkspaceState().workspaces).toHaveLength(1);
  fail = false;
  await expect(store.deleteWorkspace(original)).rejects.toThrow();
  await expect(store.createWorkspace("  ")).rejects.toThrow();
  const other = await store.createWorkspace("Other");
  await store.renameWorkspace(other.id, "Renamed");
  await store.switchWorkspace(other.id);
  await store.deleteWorkspace(other.id);
  expect(store.getWorkspaceState().activeWorkspaceId).toBe(original);
  expect(store.getSession().entries.map((entry) => entry.absPath)).toEqual(
    paths,
  );
});

test("invalid stored workspace documents and failed migration leave disk data intact", async () => {
  for (const document of [
    { version: 2, activeWorkspaceId: "missing", workspaces: [] },
    { version: 3, entries: [] },
    {
      version: 2,
      activeWorkspaceId: "default",
      workspaces: [{ id: "default", name: "Default", entries: [{}] }],
    },
  ]) {
    const original = JSON.stringify(document);
    await writeFile(file, original);
    await expect(new SessionStore(file).load()).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(original);
  }
  const original = JSON.stringify({
    entries: [{ id: "legacy", title: "Legacy", absPath: paths[0], addedAt: 1 }],
  });
  await writeFile(file, original);
  const store = new SessionStore(file, async () => {
    throw new Error("migration write failed");
  });
  await expect(store.load()).rejects.toThrow("migration write failed");
  expect(await readFile(file, "utf8")).toBe(original);
});

test("deleting an operation target rejects delayed writes and leaves other workspaces unchanged", async () => {
  const store = new SessionStore(file);
  await store.load();
  const target = await store.createWorkspace("Temporary");
  await store.deleteWorkspace(target.id);
  await expect(store.addEntries(paths, target.id)).rejects.toThrow(
    "Workspace no longer exists",
  );
  expect(store.getSession().entries).toEqual([]);
});
