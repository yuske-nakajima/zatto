import { describe, expect, it, vi } from "vitest";
import { RpcClientError, rpcCall } from "../src/shared/rpc-client.js";

const result = {
  name: "zatto",
  version: "2.0.0",
  instanceId: "server",
  protocolVersion: 2,
};
function transport(envelope: (id: unknown) => unknown) {
  return vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(envelope(JSON.parse(String(init?.body)).id)),
  );
}
describe("shared JSON-RPC client", () => {
  it("sends named params and validates the matching response", async () => {
    const fetch = transport((id) => ({ jsonrpc: "2.0", id, result }));
    const signal = new AbortController().signal;
    await expect(
      rpcCall(
        "server.health",
        {},
        { endpoint: "http://localhost/rpc", fetch, signal },
      ),
    ).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost/rpc",
      expect.objectContaining({
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: expect.any(String),
      }),
    );
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      jsonrpc: "2.0",
      id: expect.any(Number),
      method: "server.health",
      params: {},
    });
  });
  it.each([
    (id: unknown) => ({ jsonrpc: "2.0", id: `${id}`, result }),
    (id: unknown) => ({ jsonrpc: "1.0", id, result }),
    (id: unknown) => ({
      jsonrpc: "2.0",
      id,
      result,
      error: { code: 1001, message: "missing" },
    }),
    (id: unknown) => ({ jsonrpc: "2.0", id }),
    (id: unknown) => ({
      jsonrpc: "2.0",
      id,
      error: { code: "1001", message: "missing" },
    }),
    (id: unknown) => ({ jsonrpc: "2.0", id, result: { name: "zatto" } }),
  ])("rejects malformed or mismatched responses", async (envelope) => {
    await expect(
      rpcCall("server.health", {}, { fetch: transport(envelope) }),
    ).rejects.toThrow("Invalid JSON-RPC response");
  });
  it("preserves structured command errors", async () => {
    const fetch = transport((id) => ({
      jsonrpc: "2.0",
      id,
      error: {
        code: 1002,
        message: "Workspace changed",
        data: { kind: "workspace" },
      },
    }));
    const error = await rpcCall("session.clear", {}, { fetch }).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(RpcClientError);
    expect(error).toMatchObject({
      code: 1002,
      data: { kind: "workspace" },
      message: "Workspace changed",
    });
  });
  it("rejects HTTP errors and respects caller cancellation", async () => {
    await expect(
      rpcCall(
        "server.health",
        {},
        { fetch: vi.fn(async () => new Response(null, { status: 404 })) },
      ),
    ).rejects.toThrow("HTTP 404");
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      init?.signal?.throwIfAborted();
      return Response.json({});
    });
    await expect(
      rpcCall("server.health", {}, { fetch, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
