import { APP_NAME, APP_VERSION } from "../../meta.js";
import type { RpcMethod, RpcResult } from "../../shared/rpc-contract.js";
import { SessionExchangeValidationError } from "../../shared/session-exchange.js";
import { SessionImportValidationError } from "../session-import.js";
import { WorkspaceError } from "../workspace-state.js";
import {
  type CommandEffects,
  type CommandOptions,
  createCommandContext,
} from "./context.js";
import { CommandError, domainError } from "./errors.js";
import { pickerCommands } from "./pickers.js";
import { queryCommands } from "./queries.js";
import { type CommandHandlers, sessionCommands } from "./session.js";
import { commandParams, isCommandMethod } from "./validation.js";
import { workspaceCommands } from "./workspaces.js";
/** Shared validated command entry point. */
export interface Commands {
  execute<M extends RpcMethod>(
    method: M,
    params: unknown,
    effects: CommandEffects,
  ): Promise<RpcResult<M>>;
  has(method: string): method is RpcMethod;
}
/**
 * Creates the transport-independent command authority.
 * @param options - Store, identity, capabilities, and observers
 * @returns Validating command dispatcher
 * @throws Never during construction
 */
export function createCommands(options: CommandOptions): Commands {
  const context = createCommandContext(options);
  const handlers = {
    ...sessionCommands(context),
    ...pickerCommands(context),
    ...workspaceCommands(context),
    ...queryCommands(context),
  };
  return {
    has: isCommandMethod,
    async execute<M extends RpcMethod>(
      method: M,
      rawParams: unknown,
      effects: CommandEffects,
    ): Promise<RpcResult<M>> {
      if (!isCommandMethod(method))
        throw new CommandError(-32601, "Method not found");
      const params = commandParams(method, rawParams);
      try {
        if (method !== "server.health") {
          const guards = params as {
            workspaceId?: string;
            instanceId?: string;
          };
          if (guards.workspaceId !== undefined)
            context.workspace(guards.workspaceId);
          if (guards.instanceId !== undefined)
            context.identity(guards.instanceId, true);
        }
        let result: unknown;
        if (method === "server.health")
          result = {
            name: APP_NAME,
            version: APP_VERSION,
            ...options.serverIdentity,
          };
        else if (method === "server.shutdown") {
          const shutdownParams = commandParams("server.shutdown", rawParams);
          context.identity(shutdownParams.instanceId);
          if (options.shutdown) effects.push(options.shutdown);
          result = { ok: true };
        } else {
          const handler = handlers[
            method as keyof typeof handlers
          ] as CommandHandlers[M];
          result = await handler(params);
        }
        return result as RpcResult<M>;
      } catch (error) {
        if (error instanceof CommandError) throw error;
        if (error instanceof WorkspaceError)
          throw domainError("workspace", error.message);
        if (
          error instanceof SessionExchangeValidationError ||
          error instanceof SessionImportValidationError
        )
          throw new CommandError(-32602, error.message);
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw domainError("notFound", "ファイルが見つかりません");
        options.logError(error);
        throw new CommandError(-32603, "Internal error");
      }
    },
  };
}
