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
  return { store, commands, broadcast };
}
test("direct command callers share validation and optional workspace and instance guards", async () => {
  const { commands, store, broadcast } = fixture();
  for (const method of [
    "session.get",
    "session.export",
    "agentContext.get",
    "workspaces.list",
  ] as const) {
    await expect(
      commands.execute(method, { workspaceId: "stale" }, []),
    ).rejects.toMatchObject({ code: 1002, data: { kind: "workspace" } });
    await expect(
      commands.execute(method, { instanceId: "stale" }, []),
    ).rejects.toMatchObject({ code: 1003, data: { kind: "instance" } });
  }
  await expect(
    commands.execute("session.add", { paths: "file" }, []),
  ).rejects.toMatchObject({ code: -32602 });
  await expect(
    commands.execute("session.clear", { workspaceId: "stale" }, []),
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
    { paths: [file], instanceId: "server" },
    [],
  );
  const existing = await commands.execute("session.add", { paths: [file] }, []);
  expect(existing.resolved[0].id).toBe(added.added[0].id);
  expect(existing.added).toEqual([]);
  expect(broadcast).toHaveBeenCalledOnce();
  expect(store.getSession().entries).toEqual(added.added);
  await expect(
    commands.execute(
      "session.import",
      { exchange: { format: "zatto-session", version: 1, entries: [] } },
      [],
    ),
  ).rejects.toMatchObject({ code: 1003 });
});
