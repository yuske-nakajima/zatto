import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";
import { rpc } from "./rpc-server-helper.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-add-result-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
test("returns requested existing and added entries in input order without duplicates", async () => {
  const store = new SessionStore(path.join(dir, "session.json"));
  const a = path.join(dir, "a.html"),
    b = path.join(dir, "b.html");
  await writeFile(a, "<title>A</title>");
  await writeFile(b, "<title>B</title>");
  const [first] = await store.addEntries([a]);
  const app = await createApp({ sessionStore: store });
  const response = await rpc(app, "session.add", {
    ...{ paths: [b, a, b, path.join(dir, "missing")] },
  });
  expect(response.code).toBe(0);
  expect(response.json()).toMatchObject({
    workspaceId: "default",
    resolved: [{ absPath: b }, { id: first.id }],
    added: [{ absPath: b }],
  });
  expect(store.getSession().entries.map((entry) => entry.absPath)).toEqual([
    a,
    b,
  ]);
  await app.close();
});
test("resolves against the operation workspace even when a switch queues behind its write", async () => {
  const store = new SessionStore(path.join(dir, "session.json"));
  const other = await store.createWorkspace("Other");
  const a = path.join(dir, "a.html");
  await writeFile(a, "<title>A</title>");
  const pending = store.addEntriesWithResults([a]);
  const switched = store.switchWorkspace(other.id);
  const result = await pending;
  await switched;
  expect(result).toMatchObject({
    workspaceId: "default",
    resolved: [{ absPath: a }],
  });
  expect(store.getSession().entries).toEqual([]);
});
test("directory read failures reject the whole batch and identify the failed path", async () => {
  const store = new SessionStore(path.join(dir, "session.json"));
  const a = path.join(dir, "a.html");
  await writeFile(a, "<title>A</title>");
  await expect(store.addEntriesWithResults([a, dir])).rejects.toThrow(dir);
  expect(store.getSession().entries).toEqual([]);
});
test("failed persistence exposes no successful result and preserves the original collection", async () => {
  const store = new SessionStore(path.join(dir, "session.json"), async () => {
    throw new Error("write failed");
  });
  const a = path.join(dir, "a.html");
  await writeFile(a, "<title>A</title>");
  await expect(store.addEntriesWithResults([a])).rejects.toThrow(
    "write failed",
  );
  expect(store.getSession().entries).toEqual([]);
});
