import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
        "remove_files",
        "create_workspace",
        "update_files",
        "list_review_threads",
        "create_review_thread",
        "reply_review_thread",
        "resolve_review_thread",
      ],
    });
  });

  test("読取り・変更・削除・作成のツールを注釈で区別する", async () => {
    const { client } = await connect((await fixture()).connection);
    const tools = await client.listTools();

    expect(tools.tools.map(({ name }) => name)).toEqual(MCP_USAGE.tools);
    const reads = [
      "get_context",
      "get_active_file",
      "list_open_files",
      "list_workspaces",
      "list_workspace_files",
      "list_review_threads",
    ];
    const creates = [
      "create_workspace",
      "create_review_thread",
      "reply_review_thread",
    ];
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: reads.includes(tool.name),
        destructiveHint: tool.name === "remove_files",
        idempotentHint: !creates.includes(tool.name),
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

  test("選択中でないワークスペースへ登録し、選択とURLの扱いを結果で示す", async () => {
    const { connection, store, files } = await fixture();
    const research = await store.createWorkspace("Research");
    const { client } = await connect(connection);

    const result = (await toolResult(client, "add_files", {
      paths: [files.a],
      workspaceId: research.id,
    })) as { files: Array<{ id: string }> };

    expect(result).toEqual({
      workspace: { id: research.id, name: "Research", active: false },
      files: [
        {
          path: files.a,
          status: "added",
          id: result.files[0].id,
          title: "A",
          url: null,
        },
      ],
      notice:
        'The workspace "Research" is not selected in the viewer. Ask the user to select it before opening these files.',
    });
    expect(store.getWorkspace(research.id).entries).toHaveLength(1);
    expect(store.getSession().entries).toEqual([]);
    expect(store.getWorkspaceState().activeWorkspaceId).toBe("default");
  });

  test("指定したファイルだけをワークスペースから外し、ディスクには残す", async () => {
    const { connection, store, files } = await fixture();
    const research = await store.createWorkspace("Research");
    const [a, b] = await store.addEntries([files.a, files.b], research.id);
    const { client } = await connect(connection);

    await expect(
      toolResult(client, "remove_files", {
        entryIds: [a.id, "missing", a.id],
        workspaceId: research.id,
      }),
    ).resolves.toEqual({
      workspace: { id: research.id, name: "Research", active: false },
      files: [
        { id: a.id, status: "removed", title: "A", path: files.a },
        { id: "missing", status: "missing" },
      ],
    });
    expect(store.getWorkspace(research.id).entries).toEqual([b]);
    await expect(readFile(files.a, "utf8")).resolves.toContain("A");
    await expect(
      toolResult(client, "remove_files", { entryIds: ["missing"] }),
    ).resolves.toEqual({
      workspace: { id: "default", name: "Default", active: true },
      files: [{ id: "missing", status: "missing" }],
    });
  });

  test("同じ名前でもワークスペースを作成し、選択を切り替えない", async () => {
    const { connection, store } = await fixture();
    const { client } = await connect(connection);

    const first = (await toolResult(client, "create_workspace", {
      name: " Notes ",
    })) as { workspace: { id: string } };
    const second = (await toolResult(client, "create_workspace", {
      name: "Notes",
    })) as { workspace: { id: string } };

    expect(first).toEqual({
      workspace: { id: first.workspace.id, name: "Notes", active: false },
    });
    expect(second.workspace.id).not.toBe(first.workspace.id);
    expect(store.getWorkspaceState()).toEqual({
      activeWorkspaceId: "default",
      workspaces: [
        { id: "default", name: "Default" },
        { id: first.workspace.id, name: "Notes" },
        { id: second.workspace.id, name: "Notes" },
      ],
    });
  });

  test("お気に入りと並び順を指定順に適用し、変更後の位置を返す", async () => {
    const { connection, store, broadcast, files } = await fixture();
    const research = await store.createWorkspace("Research");
    const [a, b, c] = await store.addEntries(
      [files.a, files.b, files.c],
      research.id,
    );
    const { client } = await connect(connection);

    await expect(
      toolResult(client, "update_files", {
        workspaceId: research.id,
        files: [
          { entryId: c.id, position: 1, favorite: true },
          { entryId: a.id, position: 99 },
          { entryId: "missing", favorite: true },
        ],
      }),
    ).resolves.toEqual({
      workspace: { id: research.id, name: "Research", active: false },
      files: [
        {
          id: c.id,
          status: "updated",
          title: "C",
          position: 1,
          favorite: true,
        },
        {
          id: a.id,
          status: "updated",
          title: "A",
          position: 3,
          favorite: false,
        },
        { id: "missing", status: "missing" },
      ],
    });
    expect(store.getWorkspace(research.id).entries.map(({ id }) => id)).toEqual(
      [c.id, b.id, a.id],
    );
    expect(store.getWorkspaceState().activeWorkspaceId).toBe("default");
    expect(broadcast).toHaveBeenCalledTimes(2);

    const invalid = await client.callTool({
      name: "update_files",
      arguments: { files: [{ entryId: a.id }] },
    });
    expect(invalid.isError).toBe(true);
  });

  test("ユーザーのスレッドを読み、LLMとして返信・作成・解決する", async () => {
    const { connection, store, files, commands } = await fixture();
    const [entry] = await store.addEntries([files.a]);
    const userThread = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: { exact: "A", prefix: "", suffix: "" },
        author: { kind: "user" },
        body: "具体例は？",
      },
      [],
    );
    const { client } = await connect(connection);

    await expect(
      toolResult(client, "list_review_threads", { entryId: entry.id }),
    ).resolves.toMatchObject({
      workspace: { id: "default", active: true },
      threads: [
        {
          id: userThread.id,
          anchor: { exact: "A" },
          comments: [{ author: { kind: "user" }, body: "具体例は？" }],
        },
      ],
    });
    await expect(
      toolResult(client, "reply_review_thread", {
        threadId: userThread.id,
        body: "例を追記しました",
        session: "zatto:a99c",
      }),
    ).resolves.toMatchObject({
      thread: {
        comments: [
          { author: { kind: "user" } },
          {
            author: { kind: "llm", session: "zatto:a99c" },
            body: "例を追記しました",
          },
        ],
      },
    });
    const created = (await toolResult(client, "create_review_thread", {
      entryId: entry.id,
      quote: "A",
      body: "ここを確認してください",
    })) as { thread: { id: string; anchor: unknown } };
    expect(created.thread.anchor).toEqual({
      exact: "A",
      prefix: "",
      suffix: "",
    });
    await toolResult(client, "resolve_review_thread", {
      threadId: userThread.id,
    });

    const open = (await toolResult(client, "list_review_threads", {
      entryId: entry.id,
    })) as { threads: Array<{ id: string }> };
    expect(open.threads.map(({ id }) => id)).toEqual([created.thread.id]);
    const all = (await toolResult(client, "list_review_threads", {
      entryId: entry.id,
      includeResolved: true,
    })) as { threads: unknown[] };
    expect(all.threads).toHaveLength(2);
  });

  test("サーバー未起動などの接続エラーをツールエラーとして返す", async () => {
    const { client } = await connect(async () => {
      throw new Error("zatto サーバーは起動していません");
    });

    for (const name of MCP_USAGE.tools) {
      const result = await client.callTool({
        name,
        arguments: TOOL_ARGUMENTS[name] ?? {},
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

const TOOL_ARGUMENTS: Record<string, Record<string, unknown>> = {
  add_files: { paths: ["/tmp/a.html"] },
  remove_files: { entryIds: ["a"] },
  create_workspace: { name: "Notes" },
  update_files: { files: [{ entryId: "a", favorite: true }] },
  list_review_threads: { entryId: "a" },
  create_review_thread: { entryId: "a", body: "Why?" },
  reply_review_thread: { threadId: "t", body: "Fixed" },
  resolve_review_thread: { threadId: "t" },
};

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
  return { store, agentContextStore, broadcast, files, connection, commands };
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
