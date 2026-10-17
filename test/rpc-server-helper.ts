import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import type { RpcMethod, RpcResponse } from "../src/shared/rpc-contract.js";

/**
 * Calls the real HTTP RPC adapter and unwraps its command result for domain tests.
 * @param app - Application under test
 * @param method - Command name
 * @param params - Untrusted named arguments, including invalid test inputs
 * @returns RPC error code (zero for success), result reader, and raw response
 */
export async function rpc(
  app: FastifyInstance,
  method: RpcMethod,
  params: unknown = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/rpc",
    payload: { jsonrpc: "2.0", id: "test", method, params },
  });
  expect(response.statusCode).toBe(200);
  const envelope = response.json<RpcResponse>();
  expect(envelope.jsonrpc).toBe("2.0");
  expect(envelope.id).toBe("test");
  const error = "error" in envelope ? envelope.error : undefined;
  const value =
    "result" in envelope
      ? envelope.result
      : { message: error?.message, ...error?.data };
  const json: typeof response.json = <T>() => value as T;
  return {
    code: error?.code ?? 0,
    json,
    response,
    body: JSON.stringify(value),
  };
}
