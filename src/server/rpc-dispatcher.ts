import type { RpcId, RpcResponse } from "../shared/rpc-contract.js";
import type { CommandEffects } from "./commands/context.js";
import { CommandError } from "./commands/errors.js";
import type { Commands } from "./commands/index.js";
/** Transport-independent batch outcome and deferred side effects. */
export interface RpcDispatchResult {
  response: RpcResponse | RpcResponse[] | undefined;
  effects: CommandEffects;
}
/**
 * Executes JSON-RPC requests and batches sequentially with notification suppression.
 * @param input - Parsed untrusted JSON
 * @param commands - Validating command authority
 * @param logError - Notification failure logger
 * @returns Response payload and post-response effects
 * @throws Only when the supplied logger fails
 */
export async function dispatchRpc(
  input: unknown,
  commands: Commands,
  logError: (error: unknown) => void,
): Promise<RpcDispatchResult> {
  const effects: CommandEffects = [];
  async function execute(value: unknown): Promise<RpcResponse | undefined> {
    if (
      !isObject(value) ||
      value.jsonrpc !== "2.0" ||
      typeof value.method !== "string" ||
      (Object.hasOwn(value, "id") && !validId(value.id))
    )
      return failure(null, -32600, "Invalid Request");
    const notification = !Object.hasOwn(value, "id");
    const id = notification ? null : (value.id as RpcId);
    try {
      if (!commands.has(value.method))
        throw new CommandError(-32601, "Method not found");
      const result = await commands.execute(
        value.method,
        value.params === undefined ? {} : value.params,
        effects,
      );
      return notification ? undefined : { jsonrpc: "2.0", id, result };
    } catch (error) {
      const expected =
        error instanceof CommandError
          ? error
          : new CommandError(-32603, "Internal error");
      if (notification) {
        logError(error);
        return undefined;
      }
      return { jsonrpc: "2.0", id, error: expected.toJSON() };
    }
  }
  if (!Array.isArray(input)) return { response: await execute(input), effects };
  if (!input.length)
    return { response: failure(null, -32600, "Invalid Request"), effects };
  const responses: RpcResponse[] = [];
  for (const request of input) {
    const response = await execute(request);
    if (response) responses.push(response);
  }
  return { response: responses.length ? responses : undefined, effects };
}
/**
 * Creates a standard JSON-RPC failure envelope.
 * @param id - Correlated request identity
 * @param code - Standard or application error code
 * @param message - Failure description
 * @returns Error response
 * @throws Never
 */
export function failure(id: RpcId, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validId(value: unknown): value is RpcId {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
