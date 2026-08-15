import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, test } from "vitest";
import { createZattoMcpServer, MCP_USAGE } from "../src/mcp/server.js";
import type { AgentContext } from "../src/shared/agent-context.js";

const context: AgentContext = {
  schemaVersion: 1,
  activeFile: "/workspace/active.html",
  openFiles: ["/workspace/active.html", "/workspace/reference.html"],
  view: "search",
};

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
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
        "get_current_view",
      ],
    });
  });

  test("4つの読み取り専用ツールが共通コンテキストを返す", async () => {
    const { client } = await connect(async () => context);
    const tools = await client.listTools();

    expect(tools.tools.map(({ name }) => name)).toEqual(MCP_USAGE.tools);
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    await expect(toolResult(client, "get_context")).resolves.toEqual(context);
    await expect(toolResult(client, "get_active_file")).resolves.toEqual({
      schemaVersion: 1,
      activeFile: context.activeFile,
    });
    await expect(toolResult(client, "list_open_files")).resolves.toEqual({
      schemaVersion: 1,
      openFiles: context.openFiles,
    });
    await expect(toolResult(client, "get_current_view")).resolves.toEqual({
      schemaVersion: 1,
      view: context.view,
    });
  });

  test("コンテキスト取得エラーをツールエラーとして返す", async () => {
    const { client } = await connect(async () => {
      throw new Error("zatto サーバーは起動していません");
    });

    const result = await client.callTool({
      name: "get_context",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("zatto サーバーは起動していません"),
      }),
    ]);
  });
});

async function connect(readContext: () => Promise<AgentContext>) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createZattoMcpServer(readContext);
  const client = new Client({ name: "zatto-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return { client };
}

async function toolResult(client: Client, name: string): Promise<unknown> {
  const result = await client.callTool({ name, arguments: {} });
  return result.structuredContent;
}
