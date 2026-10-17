import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-favorite-api-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { force: true, recursive: true });
});
test("favorite API validates explicit booleans, publishes changes once, and rejects stale workspaces", async () => {
  const store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
  const file = path.join(dir, "page.html");
  await writeFile(file, "<title>Page</title>");
  const [entry] = await store.addEntries([file]);
  const hub = new RealtimeHub();
  const broadcast = vi.spyOn(hub, "broadcast");
  const app = await createApp({ sessionStore: store, realtimeHub: hub });
  const url = `/api/session/${entry.id}/favorite`;
  for (const payload of [
    {},
    { favorite: "true" },
    { favorite: null },
    { favorite: 1 },
  ]) {
    expect(
      (await app.inject({ method: "PATCH", url, payload })).statusCode,
    ).toBe(400);
  }
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: "/api/session/missing/favorite",
        payload: { favorite: true },
      })
    ).statusCode,
  ).toBe(404);
  for (let index = 0; index < 2; index++)
    expect(
      (await app.inject({ method: "PATCH", url, payload: { favorite: true } }))
        .statusCode,
    ).toBe(204);
  expect(broadcast).toHaveBeenCalledOnce();
  expect(broadcast.mock.calls[0][0]).toMatchObject({
    type: "session:update",
    entries: [{ id: entry.id, favorite: true }],
  });
  expect((await app.inject("/api/session/export")).json()).toEqual({
    format: "zatto-session",
    version: 1,
    entries: [{ path: file }],
  });
  const other = await store.createWorkspace("Other");
  await store.switchWorkspace(other.id);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url,
        payload: { favorite: false },
        headers: { "x-zatto-workspace-id": "default" },
      })
    ).statusCode,
  ).toBe(409);
  await store.switchWorkspace("default");
  expect(store.getEntry(entry.id)?.favorite).toBe(true);
  await app.close();
});
test("persistence errors return failure without publishing or changing favorites", async () => {
  let fail = false;
  const file = path.join(dir, "session.json");
  const store = new SessionStore(file, async (target, content) => {
    if (fail) throw new Error("write failed");
    await writeFileAtomically(target, content);
  });
  await store.load();
  const html = path.join(dir, "page.html");
  await writeFile(html, "<title>Page</title>");
  const [entry] = await store.addEntries([html]);
  const before = await readFile(file, "utf8");
  const hub = new RealtimeHub();
  const broadcast = vi.spyOn(hub, "broadcast");
  const app = await createApp({ sessionStore: store, realtimeHub: hub });
  fail = true;
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/session/${entry.id}/favorite`,
        payload: { favorite: true },
      })
    ).statusCode,
  ).toBe(500);
  expect(store.getEntry(entry.id)?.favorite).toBeUndefined();
  expect(await readFile(file, "utf8")).toBe(before);
  expect(broadcast).not.toHaveBeenCalled();
  await app.close();
});
