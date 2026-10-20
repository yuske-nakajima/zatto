import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { SessionStore } from "../src/server/session.js";
import {
  WORKSPACE_BACKUP_DIRECTORY,
  WORKSPACE_BACKUP_LIMIT,
  workspaceFilePath,
} from "../src/server/workspace-store.js";

let dir: string;
let sessionFile: string;
let page: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-workspace-backup-"));
  sessionFile = path.join(dir, "session.json");
  page = path.join(dir, "page.html");
  await writeFile(page, "<title>Page</title>");
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

const v2 = (entries: unknown[]) => ({
  version: 2,
  activeWorkspaceId: "work",
  workspaces: [
    { id: "default", name: "Default", entries: [] },
    { id: "work", name: "Work", entries },
  ],
});

async function backups(): Promise<string[]> {
  return readdir(path.join(dir, WORKSPACE_BACKUP_DIRECTORY)).catch(() => []);
}

test("session.json のワークスペースを workspaces.json へ移し、session.json は書き換えない", async () => {
  const legacy = JSON.stringify(
    v2([{ id: "p", title: "Page", absPath: page, addedAt: 1 }]),
  );
  await writeFile(sessionFile, legacy);

  const store = new SessionStore(sessionFile);
  await store.load();
  await store.setFavorite("p", true, "work");

  expect(await readFile(sessionFile, "utf8")).toBe(legacy);
  const saved = JSON.parse(
    await readFile(workspaceFilePath(sessionFile), "utf8"),
  );
  expect(saved.workspaces.map(({ name }: { name: string }) => name)).toEqual([
    "Default",
    "Work",
  ]);
});

test("移したあとに古い版が session.json を書き換えても、ワークスペースは残る", async () => {
  await writeFile(
    sessionFile,
    JSON.stringify(v2([{ id: "p", title: "Page", absPath: page, addedAt: 1 }])),
  );
  await new SessionStore(sessionFile).load();
  // ワークスペースのない版が、空のセッションとして上書きした状態
  await writeFile(sessionFile, JSON.stringify({ entries: [] }));

  const store = new SessionStore(sessionFile);
  await store.load();
  expect(store.getWorkspaceState().workspaces.map(({ name }) => name)).toEqual([
    "Default",
    "Work",
  ]);
  expect(store.getSession().entries.map(({ id }) => id)).toEqual(["p"]);
});

test("保存のたびに直前の内容を backups/ に残し、上限を超えた古いものから消す", async () => {
  const store = new SessionStore(sessionFile);
  await store.load();
  const [entry] = await store.addEntries([page], "default");
  expect(await backups()).toEqual([]);

  const before = await readFile(workspaceFilePath(sessionFile), "utf8");
  await store.setFavorite(entry?.id ?? "", true, "default");
  const [first] = await backups();
  expect(
    await readFile(
      path.join(dir, WORKSPACE_BACKUP_DIRECTORY, first ?? ""),
      "utf8",
    ),
  ).toBe(before);

  for (let index = 0; index < WORKSPACE_BACKUP_LIMIT + 5; index += 1)
    await store.setFavorite(entry?.id ?? "", index % 2 === 0, "default");
  expect(await backups()).toHaveLength(WORKSPACE_BACKUP_LIMIT);
  expect(await backups()).not.toContain(first);
});

test("内容が変わらない保存と、失敗した保存ではバックアップを残さない", async () => {
  const store = new SessionStore(sessionFile);
  await store.load();
  const [entry] = await store.addEntries([page], "default");
  await new SessionStore(sessionFile).load();
  expect(await backups()).toEqual([]);

  let full = false;
  const failing = new SessionStore(sessionFile, async (target, content) => {
    if (full) throw new Error("disk full");
    await writeFile(target, content);
  });
  await failing.load();
  full = true;
  await expect(
    failing.setFavorite(entry?.id ?? "", true, "default"),
  ).rejects.toThrow("disk full");
  expect(await backups()).toEqual([]);
});
