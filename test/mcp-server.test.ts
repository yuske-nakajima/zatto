import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createZattoMcpServer,
  MCP_USAGE,
  type ZattoConnection,
} from "../src/mcp/server.js";
import { AgentContextStore } from "../src/server/agent-context.js";
import { createCommands } from "../src/server/commands/index.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";
import { RpcClientError } from "../src/shared/rpc-client.js";
import { isRpcResult } from "../src/shared/rpc-result.js";

const BASE_URL = "http://127.0.0.1:6399/";
const closeCallbacks: Array<() => Promise<void>> = [];
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-mcp-"));
});
afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
  await rm(dir, { force: true, recursive: true });
});

describe("Zatto MCP server", () => {
  test("製品非依存のstdio接続情報を公開する", () => {
    expect(MCP_USAGE).toEqual({
      protocol: "mcp",
      transport: "stdio",
      command: "zatto",
      args: ["mcp", "serve"],
      tools: [
        "get_context",
        "get_active_file",
        "list_open_files",
        "list_workspaces",
        "list_workspace_files",
        "add_files",
      ],
    });
  });

  test("読取りツールと登録ツールを注釈で区別する", async () => {
    const { client } = await connect((await fixture()).connection);
    const tools = await client.listTools();

    expect(tools.tools.map(({ name }) => name)).toEqual(MCP_USAGE.tools);
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: tool.name !== "add_files",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  test("既存の3ツールは選択中ワークスペースのコンテキストを返す", async () => {
    const { connection, store, agentContextStore, files } = await fixture();
    const [active] = await store.addEntries([files.a, files.b]);
    agentContextStore.setBrowserContext({
      activeEntryId: active.id,
      view: "search",
    });
    const { client } = await connect(connection);

    await expect(toolResult(client, "get_context")).resolves.toEqual({
      schemaVersion: 1,
      activeFile: { title: "A", path: files.a },
      openFiles: [
        { title: "A", path: files.a },
        { title: "B", path: files.b },
      ],
      view: "search",
    });
    await expect(toolResult(client, "get_active_file")).resolves.toEqual({
      schemaVersion: 1,
      activeFile: { title: "A", path: files.a },
    });
    await expect(toolResult(client, "list_open_files")).resolves.toEqual({
      schemaVersion: 1,
      openFiles: [
        { title: "A", path: files.a },
        { title: "B", path: files.b },
      ],
    });
  });

  test("選択を変えずに全ワークスペースと並び順・お気に入り・選択状態を参照する", async () => {
    const { connection, store, agentContextStore, files } = await fixture();
    const [a, b] = await store.addEntries([files.a, files.b]);
    await store.reorderEntries([b.id, a.id], "default");
    await store.setFavorite(a.id, true, "default");
    agentContextStore.setBrowserContext({
      activeEntryId: b.id,
      view: "preview",
    });
    const research = await store.createWorkspace("Research");
    await store.addEntries([files.c], research.id);
    const { client } = await connect(connection);

    await expect(toolResult(client, "list_workspaces")).resolves.toEqual({
      activeWorkspaceId: "default",
      workspaces: [
        { id: "default", name: "Default", active: true },
        { id: research.id, name: "Research", active: false },
      ],
    });
    await expect(toolResult(client, "list_workspace_files")).resolves.toEqual({
      workspace: { id: "default", name: "Default", active: true },
      files: [
        {
          id: b.id,
          title: "B",
          path: files.b,
          position: 1,
          favorite: false,
          selected: true,
          url: `${BASE_URL}?entry=${b.id}`,
        },
        {
          id: a.id,
          title: "A",
          path: files.a,
          position: 2,
          favorite: true,
          selected: false,
          url: `${BASE_URL}?entry=${a.id}`,
        },
      ],
    });
    await expect(
      toolResult(client, "list_workspace_files", { workspaceId: research.id }),
    ).resolves.toMatchObject({
      workspace: { id: research.id, name: "Research", active: false },
      files: [
        {
          title: "C",
          path: files.c,
          position: 1,
          favorite: false,
          selected: false,
          url: null,
        },
      ],
    });
    expect(store.getWorkspaceState().activeWorkspaceId).toBe("default");
  });

  test("存在しないワークスペースは種類付きのツールエラーになる", async () => {
    const { client } = await connect((await fixture()).connection);

    const result = await client.callTool({
      name: "list_workspace_files",
      arguments: { workspaceId: "missing" },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining("(kind: workspace)"),
      }),
    ]);
  });

  test("選択中ワークスペースへ登録し、状態とURLを返して更新を配信する", async () => {
    const { connection, store, broadcast, files } = await fixture();
    const [existing] = await store.addEntries([files.a]);
    await store.setFavorite(existing.id, true, "default");
    const missing = path.join(dir, "missing.html");
    const { client } = await connect(connection);

    const result = (await toolResult(client, "add_files", {
      paths: [files.b, files.a, missing, files.b],
    })) as { files: Array<{ id?: string }> };

    const addedId = result.files[0].id;
    expect(result).toEqual({
      workspace: { id: "default", name: "Default", active: true },
      files: [
        {
          path: files.b,
          status: "added",
          id: addedId,
          title: "B",
          url: `${BASE_URL}?entry=${addedId}`,
        },
        {
          path: files.a,
          status: "existing",
          id: existing.id,
          title: "A",
          url: `${BASE_URL}?entry=${existing.id}`,
        },
        { path: missing, status: "missing" },
      ],
    });
    expect(store.getSession().entries.map(({ absPath }) => absPath)).toEqual([
      files.a,
      files.b,
    ]);
    expect(store.getSession().entries[0].favorite).toBe(true);
    expect(broadcast).toHaveBeenCalledOnce();
  });

  test("相対パスの登録は検証エラーで拒否し、保存しない", async () => {
    const { connection, store } = await fixture();
    const { client } = await connect(connection);

    const result = await client.callTool({
      name: "add_files",
      arguments: { paths: ["relative.html"] },
    });

    expect(result.isError).toBe(true);
    expect(store.getSession().entries).toEqual([]);
  });

  test("サーバー未起動などの接続エラーをツールエラーとして返す", async () => {
    const { client } = await connect(async () => {
      throw new Error("zatto サーバーは起動していません");
    });

    for (const name of MCP_USAGE.tools) {
      const result = await client.callTool({
        name,
        arguments: name === "add_files" ? { paths: ["/tmp/a.html"] } : {},
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("zatto サーバーは起動していません"),
        }),
      ]);
    }
  });
});

async function fixture() {
  const store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
  const agentContextStore = new AgentContextStore();
  const hub = new RealtimeHub();
  const broadcast = vi.spyOn(hub, "broadcast");
  const commands = createCommands({
    sessionStore: store,
    agentContextStore,
    realtimeHub: hub,
    serverIdentity: { instanceId: "server", protocolVersion: 3 },
    logError: vi.fn(),
  });
  const files = {
    a: path.join(dir, "a.html"),
    b: path.join(dir, "b.html"),
    c: path.join(dir, "c.html"),
  };
  for (const [name, file] of Object.entries(files))
    await writeFile(file, `<title>${name.toUpperCase()}</title>`);
  const connection: () => Promise<ZattoConnection> = async () => ({
    baseUrl: BASE_URL,
    async call(method, params) {
      try {
        const value = await commands.execute(
          method,
          { ...params, instanceId: "server" },
          [],
        );
        if (!isRpcResult(method, value)) throw new Error("Invalid result");
        return value;
      } catch (error) {
        if (error instanceof Error && "toJSON" in error)
          throw new RpcClientError(
            (error as unknown as { toJSON(): never }).toJSON(),
          );
        throw error;
      }
    },
  });
  return { store, agentContextStore, broadcast, files, connection };
}

async function connect(connection: () => Promise<ZattoConnection>) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createZattoMcpServer(connection);
  const client = new Client({ name: "zatto-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return { client };
}

async function toolResult(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBeFalsy();
  return result.structuredContent;
}
