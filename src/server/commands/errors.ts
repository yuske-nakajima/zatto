import { RPC_ERROR, type RpcErrorData } from "../../shared/rpc-contract.js";
/** An expected command failure, independent of its transport. */
export class CommandError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
  /** Returns the JSON-RPC error payload. */
  toJSON(): RpcErrorData {
    return {
      code: this.code,
      message: this.message,
      ...(this.data ? { data: this.data } : {}),
    };
  }
}
/**
 * Creates a stable domain error.
 * @param kind - Shared domain error name
 * @param message - User-facing explanation
 * @param data - Additional structured details
 * @returns Command failure
 * @throws Never
 */
export function domainError(
  kind: keyof typeof RPC_ERROR,
  message: string,
  data: Record<string, unknown> = {},
): CommandError {
  return new CommandError(RPC_ERROR[kind], message, { ...data, kind });
}
