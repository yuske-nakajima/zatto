import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AgentContextStore } from "../src/server/agent-context.js";
import { createCommands } from "../src/server/commands/index.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-commands-"));
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});
function fixture() {
  const store = new SessionStore(path.join(dir, "session.json"));
  const hub = new RealtimeHub();
  const broadcast = vi.spyOn(hub, "broadcast");
  const commands = createCommands({
    sessionStore: store,
    agentContextStore: new AgentContextStore(),
    realtimeHub: hub,
    serverIdentity: { instanceId: "server", protocolVersion: 3 },
    logError: vi.fn(),
  });
  return { store, commands, broadcast, hub };
}
test("direct command callers share validation, workspace targets, and instance guards", async () => {
  const { commands, store, broadcast } = fixture();
  for (const method of [
    "session.get",
    "agentContext.get",
    "workspaces.list",
  ] as const) {
    await expect(
      commands.execute(method, { workspaceId: "default" }, []),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      commands.execute(method, { instanceId: "stale" }, []),
    ).rejects.toMatchObject({ code: 1003, data: { kind: "instance" } });
  }
  for (const [method, params] of [
    ["session.add", { paths: [] }],
    ["session.clear", {}],
    ["session.export", {}],
  ] as const)
    await expect(commands.execute(method, params, [])).rejects.toMatchObject({
      code: -32602,
    });
  await expect(
    commands.execute(
      "session.add",
      { paths: "file", workspaceId: "default" },
      [],
    ),
  ).rejects.toMatchObject({ code: -32602 });
  for (const method of ["session.clear", "session.export"] as const)
    await expect(
      commands.execute(method, { workspaceId: "stale" }, []),
    ).rejects.toMatchObject({ code: 1002, data: { kind: "workspace" } });
  await expect(
    commands.execute(
      "agentContext.set",
      { workspaceId: "stale", activeEntryId: null, view: "preview" },
      [],
    ),
  ).rejects.toMatchObject({ code: 1002 });
  expect(store.getSession().entries).toEqual([]);
  expect(broadcast).not.toHaveBeenCalled();
});
test("direct commands publish persisted mutations and preserve entry identity", async () => {
  const { commands, store, broadcast } = fixture();
  const file = path.join(dir, "a.html");
  await writeFile(file, "<title>A</title>");
  const added = await commands.execute(
    "session.add",
    { paths: [file], instanceId: "server", workspaceId: "default" },
    [],
  );
  const existing = await commands.execute(
    "session.add",
    { paths: [file], workspaceId: "default" },
    [],
  );
  expect(existing.resolved[0].id).toBe(added.added[0].id);
  expect(existing.added).toEqual([]);
  expect(broadcast).toHaveBeenCalledOnce();
  expect(store.getSession().entries).toEqual(added.added);
  await expect(
    commands.execute(
      "session.import",
      {
        exchange: { format: "zatto-session", version: 1, entries: [] },
        workspaceId: "default",
      },
      [],
    ),
  ).rejects.toMatchObject({ code: 1003 });
});
test("viewer.show は選択中のワークスペースを開いている Web UI のタブにだけ表示を頼む", async () => {
  const { commands, store, broadcast, hub } = fixture();
  await store.load();
  const file = path.join(dir, "plan.md");
  await writeFile(file, "# plan\n");
  const add = async (workspaceId: string) =>
    (await commands.execute("session.add", { paths: [file], workspaceId }, []))
      .resolved[0]?.id ?? "";
  const active = store.getWorkspaceState().activeWorkspaceId;
  const params = { workspaceId: active, entryId: await add(active) };
  await expect(commands.execute("viewer.show", params, [])).resolves.toEqual({
    shown: false,
  });

  hub.add({ readyState: 1, once: vi.fn(), send: vi.fn() } as never);
  await expect(commands.execute("viewer.show", params, [])).resolves.toEqual({
    shown: false,
  });
  hub.add({ readyState: 1, once: vi.fn(), send: vi.fn() } as never, "viewer");
  await expect(commands.execute("viewer.show", params, [])).resolves.toEqual({
    shown: true,
  });
  expect(broadcast).toHaveBeenLastCalledWith({
    type: "viewer:show",
    ...params,
  });

  const other = (
    await commands.execute("workspaces.create", { name: "other" }, [])
  ).id;
  await expect(
    commands.execute(
      "viewer.show",
      { workspaceId: other, entryId: await add(other) },
      [],
    ),
  ).resolves.toEqual({ shown: false });
  await expect(
    commands.execute("viewer.show", { ...params, entryId: "missing" }, []),
  ).rejects.toMatchObject({ code: 1001 });
});
test("review.get はスレッドの全文と、選択中でないワークスペースのファイルも返す", async () => {
  const { commands, store } = fixture();
  await store.load();
  const file = path.join(dir, "plan.md");
  await writeFile(file, "# plan\n");
  const other = await commands.execute(
    "workspaces.create",
    { name: "other" },
    [],
  );
  const [entry] = (
    await commands.execute(
      "session.add",
      { paths: [file], workspaceId: other.id },
      [],
    )
  ).resolved;
  const thread = await commands.execute(
    "review.create",
    {
      workspaceId: other.id,
      entryId: entry?.id ?? "",
      anchor: null,
      author: { kind: "user" },
      body: "全体の確認",
    },
    [],
  );
  await expect(
    commands.execute("review.get", { threadId: thread.id }, []),
  ).resolves.toEqual({
    thread,
    file: { id: entry?.id, title: entry?.title, path: file },
  });
  await expect(
    commands.execute("review.get", { threadId: "missing" }, []),
  ).rejects.toMatchObject({ code: 1001 });
});
