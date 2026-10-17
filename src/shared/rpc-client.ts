import type {
  RpcErrorData,
  RpcMethod,
  RpcParams,
  RpcResult,
} from "./rpc-contract.js";
import { isRpcResult, object } from "./rpc-result.js";

export interface RpcClientOptions {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

/** A command failure retaining the server's public error code and details. */
export class RpcClientError extends Error {
  readonly code: number;
  readonly data?: Record<string, unknown>;
  constructor(error: RpcErrorData) {
    super(error.message);
    this.name = "RpcClientError";
    this.code = error.code;
    this.data = error.data;
  }
}

let nextId = 0;
/** Sends one request and rejects transport, envelope, and result contract violations. */
export async function rpcCall<M extends RpcMethod>(
  method: M,
  params: RpcParams<M>,
  options: RpcClientOptions = {},
): Promise<RpcResult<M>> {
  const id = ++nextId;
  const response = await (options.fetch ?? globalThis.fetch)(
    options.endpoint ?? "/rpc",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  if (!response.ok) throw new Error(`JSON-RPC HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (
    !object(value) ||
    value.jsonrpc !== "2.0" ||
    value.id !== id ||
    "result" in value === "error" in value
  ) {
    throw new Error("Invalid JSON-RPC response");
  }
  if ("error" in value) {
    const error = value.error;
    if (
      !object(error) ||
      !Number.isInteger(error.code) ||
      typeof error.message !== "string" ||
      (error.data !== undefined && !object(error.data))
    ) {
      throw new Error("Invalid JSON-RPC response");
    }
    throw new RpcClientError(error as unknown as RpcErrorData);
  }
  if (!isRpcResult(method, value.result))
    throw new Error("Invalid JSON-RPC response result");
  return value.result;
}
