import { rpcCall } from "../shared/rpc-client.js";
import type { RpcMethod, RpcParams } from "../shared/rpc-contract.js";

export async function requestSessionChange<M extends RpcMethod>(
  method: M,
  params: RpcParams<M>,
): Promise<boolean> {
  try {
    await rpcCall(method, params);
    return true;
  } catch {
    return false;
  }
}
