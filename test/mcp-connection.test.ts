import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMcpConnector } from "../src/cli/mcp-connection.js";
import {
  SERVER_PROTOCOL_VERSION,
  writeServerRecord,
} from "../src/server/runtime.js";
import { rpcFixture } from "./rpc-client-fixture.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-mcp-connection-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("稼働中サーバーの識別子を付けて共有RPCへ委譲し、閲覧URLの基点を返す", async () => {
  const runtimeFilePath = path.join(dir, "server.json");
  await writeServerRecord(runtimeFilePath, {
    instanceId: "running",
    pid: process.pid,
    port: 7346,
    protocolVersion: SERVER_PROTOCOL_VERSION,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(
    rpcFixture(async (method, init) => {
      calls.push({
        method: String(method),
        params: JSON.parse(String(init?.body)),
      });
      if (method === "server.health")
        return Response.json({
          name: "zatto",
          version: "2.0.0",
          instanceId: "running",
          protocolVersion: SERVER_PROTOCOL_VERSION,
        });
      return Response.json({ id: "w1", name: "Research", entries: [] });
    }),
  );

  const connection = await createMcpConnector({ fetch, runtimeFilePath })();
  await expect(
    connection.call("workspaces.get", { id: "w1" }),
  ).resolves.toEqual({ id: "w1", name: "Research", entries: [] });

  expect(connection.baseUrl).toBe("http://127.0.0.1:7346/");
  expect(calls.at(-1)).toEqual({
    method: "workspaces.get",
    params: { id: "w1", instanceId: "running" },
  });
});

test("サーバーが起動していない場合は起動せずに失敗する", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  await expect(
    createMcpConnector({
      fetch,
      runtimeFilePath: path.join(dir, "missing.json"),
    })(),
  ).rejects.toThrow("起動していません");
});
