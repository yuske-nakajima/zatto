import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";

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
test("workspace API switches isolated entries and refuses stale clear requests", async () => {
  const app = await createApp({ sessionStore: store });
  const file = path.join(dir, "one.html");
  await writeFile(file, "<title>One</title>");
  await store.addEntries([file]);
  const initial = (await app.inject("/api/session")).json();
  const created = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: "Research" },
  });
  expect(created.statusCode).toBe(201);
  const id = created.json().id;
  expect(
    (
      await app.inject({ method: "PUT", url: `/api/workspaces/${id}/activate` })
    ).json().entries,
  ).toEqual([]);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/session",
        headers: { "x-zatto-workspace-id": initial.activeWorkspaceId },
      })
    ).statusCode,
  ).toBe(409);
  await app.inject({
    method: "PUT",
    url: `/api/workspaces/${initial.activeWorkspaceId}/activate`,
  });
  expect(store.getSession().entries).toHaveLength(1);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/workspaces/${id}`,
        payload: { name: "Renamed" },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await app.inject({ method: "DELETE", url: `/api/workspaces/${id}` }))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/workspaces/${initial.activeWorkspaceId}`,
      })
    ).statusCode,
  ).toBe(409);
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
  const picking = app.inject({
    method: "POST",
    url: "/api/session/pick",
    headers: { "x-zatto-instance-id": "server" },
  });
  void picking.then(() => {});
  await ready;
  await store.switchWorkspace(other.id);
  finish({ kind: "selected", paths: [file] });
  expect((await picking).statusCode).toBe(201);
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
  const adding = app.inject({
    method: "POST",
    url: "/api/session/add",
    payload: { paths: [file] },
  });
  void adding.then(() => {});
  await started;
  const clearing = app.inject({ method: "DELETE", url: "/api/session" });
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
