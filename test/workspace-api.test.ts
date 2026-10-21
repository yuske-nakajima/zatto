import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";
import { rpc } from "./rpc-server-helper.js";

let dir: string;
let store: SessionStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-ws-api-"));
  store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});
test("workspace API switches isolated entries and applies requests to the named workspace", async () => {
  const app = await createApp({ sessionStore: store });
  const file = path.join(dir, "one.html");
  await writeFile(file, "<title>One</title>");
  await store.addEntries([file]);
  const initial = (await rpc(app, "session.get", {})).json();
  const created = await rpc(app, "workspaces.create", {
    ...{ name: "Research" },
  });
  expect(created.code).toBe(0);
  const id = created.json().id;
  expect(
    (await rpc(app, "workspaces.activate", { id: id })).json().entries,
  ).toEqual([]);
  const second = path.join(dir, "two.html");
  await writeFile(second, "<title>Two</title>");
  expect(
    (
      await rpc(app, "session.add", {
        workspaceId: initial.activeWorkspaceId,
        paths: [second],
      })
    ).json(),
  ).toMatchObject({
    workspaceId: initial.activeWorkspaceId,
    activeWorkspaceId: id,
    session: { entries: [] },
  });
  expect(store.getSession().entries).toEqual([]);
  await rpc(app, "workspaces.activate", { id: initial.activeWorkspaceId });
  expect(store.getSession().entries).toHaveLength(2);
  expect(
    (await rpc(app, "session.clear", { workspaceId: "missing" })).code,
  ).toBe(1002);
  expect((await rpc(app, "session.clear", { workspaceId: id })).code).toBe(0);
  expect(store.getSession().entries).toHaveLength(2);
  expect(
    (await rpc(app, "workspaces.rename", { id: id, ...{ name: "Renamed" } }))
      .code,
  ).toBe(0);
  expect((await rpc(app, "workspaces.delete", { id: id })).code).toBe(0);
  expect(
    (await rpc(app, "workspaces.delete", { id: initial.activeWorkspaceId }))
      .code,
  ).toBe(1002);
  await app.close();
});
test("workspaces.get reads any workspace in List order without changing the selection", async () => {
  const app = await createApp({ sessionStore: store });
  const first = path.join(dir, "one.html");
  const second = path.join(dir, "two.html");
  await writeFile(first, "<title>One</title>");
  await writeFile(second, "<title>Two</title>");
  const research = await store.createWorkspace("Research");
  const [one, two] = await store.addEntries([first, second], research.id);
  await store.reorderEntries([two.id, one.id], research.id);
  await store.setFavorite(one.id, true, research.id);
  const read = await rpc(app, "workspaces.get", { id: research.id });
  expect(read.code).toBe(0);
  expect(read.json()).toEqual({
    id: research.id,
    name: "Research",
    entries: [two, { ...one, favorite: true, favoriteRank: 0 }],
  });
  expect(store.getWorkspaceState().activeWorkspaceId).toBe("default");
  expect((await rpc(app, "workspaces.get", { id: "missing" })).code).toBe(1002);
  expect((await rpc(app, "workspaces.get", {})).code).toBe(-32602);
  await app.close();
});
test("a native picker started in a workspace adds only to that workspace after switching", async () => {
  const file = path.join(dir, "one.html");
  await writeFile(file, "<title>One</title>");
  let finish: (value: { kind: "selected"; paths: string[] }) => void = () => {};
  let started: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const app = await createApp({
    sessionStore: store,
    serverIdentity: { instanceId: "server", protocolVersion: 1 },
    pickFiles: () =>
      new Promise((resolve) => {
        finish = resolve;
        started();
      }),
  });
  const initial = store.getWorkspaceState().activeWorkspaceId;
  const other = await store.createWorkspace("Other");
  const picking = rpc(app, "session.pickFiles", {
    workspaceId: "default",
    instanceId: "server",
  });
  void picking.then(() => {});
  await ready;
  await store.switchWorkspace(other.id);
  finish({ kind: "selected", paths: [file] });
  expect((await picking).code).toBe(0);
  expect(store.getSession().entries).toEqual([]);
  await store.switchWorkspace(initial);
  expect(store.getSession().entries[0].absPath).toBe(file);
  await app.close();
});

test("a clear queued behind an addition publishes the empty committed collection", async () => {
  const { writeFileAtomically } = await import("../src/shared/atomic-file.js");
  const { RealtimeHub } = await import("../src/server/realtime.js");
  const { vi } = await import("vitest");
  let finishWrite: () => void = () => {};
  let startedWrite: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    startedWrite = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  let firstWrite = true;
  const localStore = new SessionStore(
    path.join(dir, "queued.json"),
    async (file, content) => {
      if (firstWrite) {
        firstWrite = false;
        startedWrite();
        await gate;
      }
      await writeFileAtomically(file, content);
    },
  );
  await localStore.load();
  const hub = new RealtimeHub();
  const broadcast = vi.spyOn(hub, "broadcast");
  const app = await createApp({ sessionStore: localStore, realtimeHub: hub });
  const file = path.join(dir, "queued.html");
  await writeFile(file, "<title>Queued</title>");
  const adding = rpc(app, "session.add", {
    workspaceId: "default",
    ...{ paths: [file] },
  });
  void adding.then(() => {});
  await started;
  const clearing = rpc(app, "session.clear", { workspaceId: "default" });
  void clearing.then(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  finishWrite();
  await Promise.all([adding, clearing]);
  expect(localStore.getSession().entries).toEqual([]);
  expect(broadcast.mock.calls.at(-1)?.[0]).toMatchObject({
    type: "session:update",
    entries: [],
  });
  await app.close();
});
