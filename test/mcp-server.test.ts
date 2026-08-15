import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, test } from "vitest";
import { createZattoMcpServer, MCP_USAGE } from "../src/mcp/server.js";
import type { AgentContext } from "../src/shared/agent-context.js";

const context: AgentContext = {
  schemaVersion: 1,
  activeFile: { title: "Active page", path: "/workspace/active.html" },
  openFiles: [
    { title: "Active page", path: "/workspace/active.html" },
    { title: "Reference", path: "/workspace/reference.html" },
  ],
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
      tools: ["get_context", "get_active_file", "list_open_files"],
    });
  });

  test("3つの読み取り専用ツールが用途別に共通コンテキストを返す", async () => {
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
    expect(
      tools.tools.find(({ name }) => name === "get_context")?.description,
    ).toContain("selection, file collection, and current view");
    expect(
      tools.tools.find(({ name }) => name === "get_active_file")?.description,
    ).toContain("without exposing the complete file list");
    expect(
      tools.tools.find(({ name }) => name === "list_open_files")?.description,
    ).toContain("identify an ambiguous target");
    await expect(toolResult(client, "get_context")).resolves.toEqual(context);
    await expect(toolResult(client, "get_active_file")).resolves.toEqual({
      schemaVersion: 1,
      activeFile: context.activeFile,
    });
    await expect(toolResult(client, "list_open_files")).resolves.toEqual({
      schemaVersion: 1,
      openFiles: context.openFiles,
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
