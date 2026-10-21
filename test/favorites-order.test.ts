import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AgentContextStore } from "../src/server/agent-context.js";
import { createCommands } from "../src/server/commands/index.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";
import { workspaceFilePath } from "../src/server/workspace-store.js";
import { orderedFavorites } from "../src/shared/favorites.js";

let dir: string;
let file: string;
let paths: string[];
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-favorites-order-"));
  file = path.join(dir, "session.json");
  paths = ["a", "b", "c", "d"].map((name) => path.join(dir, `${name}.html`));
  await Promise.all(
    paths.map((page, index) => writeFile(page, `<title>${index}</title>`)),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ids = (entries: { id: string }[]) => entries.map(({ id }) => id);

test("お気に入りは List とは別の順で並べ替え、新しいお気に入りは末尾に加わる。再起動しても順が残る", async () => {
  const store = new SessionStore(file);
  await store.load();
  const [a, b, c, d] = await store.addEntries(paths);
  const listOrder = ids([a, b, c, d]);
  for (const entry of [c, a, b]) await store.setFavorite(entry.id, true);
  expect(ids(orderedFavorites(store.getSession().entries))).toEqual(
    ids([c, a, b]),
  );

  expect(await store.reorderFavorites(ids([b, c, a]))).toBe(true);
  expect(ids(store.getSession().entries)).toEqual(listOrder);
  await store.setFavorite(d.id, true);
  expect(ids(orderedFavorites(store.getSession().entries))).toEqual(
    ids([b, c, a, d]),
  );

  await store.setFavorite(c.id, false);
  const restarted = new SessionStore(file);
  await restarted.load();
  expect(ids(orderedFavorites(restarted.getSession().entries))).toEqual(
    ids([b, a, d]),
  );
  expect(
    restarted.getSession().entries.find(({ id }) => id === c.id)?.favoriteRank,
  ).toBeUndefined();
});

test("お気に入りと一致しない ID の並べ替えは拒否し、保存失敗では順を変えない", async () => {
  let full = false;
  const store = new SessionStore(file, async (target, content) => {
    if (full) throw new Error("disk full");
    await writeFile(target, content);
  });
  await store.load();
  const [a, b, c] = await store.addEntries(paths.slice(0, 3));
  await store.setFavorite(a.id, true);
  await store.setFavorite(b.id, true);
  for (const wrong of [[a.id], [a.id, c.id], [a.id, a.id], [a.id, b.id, c.id]])
    expect(await store.reorderFavorites(wrong)).toBe(false);

  const before = await readFile(workspaceFilePath(file), "utf8");
  full = true;
  await expect(store.reorderFavorites([b.id, a.id])).rejects.toThrow(
    "disk full",
  );
  expect(ids(orderedFavorites(store.getSession().entries))).toEqual([
    a.id,
    b.id,
  ]);
  expect(await readFile(workspaceFilePath(file), "utf8")).toBe(before);
});

test("session.reorderFavorites は不正な ID を -32602 で拒否し、保存したら 1 回だけ通知する", async () => {
  const store = new SessionStore(file);
  const hub = new RealtimeHub();
  const broadcast = vi.spyOn(hub, "broadcast");
  const commands = createCommands({
    sessionStore: store,
    agentContextStore: new AgentContextStore(),
    realtimeHub: hub,
    logError: vi.fn(),
  });
  await store.load();
  const workspaceId = store.getWorkspaceState().activeWorkspaceId;
  const [a, b] = await store.addEntries(paths.slice(0, 2), workspaceId);
  await store.setFavorite(a.id, true, workspaceId);
  await store.setFavorite(b.id, true, workspaceId);

  await expect(
    commands.execute(
      "session.reorderFavorites",
      { ids: [a.id], workspaceId },
      [],
    ),
  ).rejects.toMatchObject({ code: -32602 });
  broadcast.mockClear();
  await commands.execute(
    "session.reorderFavorites",
    { ids: [b.id, a.id], workspaceId },
    [],
  );
  expect(broadcast).toHaveBeenCalledTimes(1);
  expect(ids(orderedFavorites(store.getSession().entries))).toEqual([
    b.id,
    a.id,
  ]);
});
