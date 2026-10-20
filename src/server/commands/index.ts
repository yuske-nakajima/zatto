import { APP_NAME, APP_VERSION } from "../../meta.js";
import type {
  RpcAccess,
  RpcMethod,
  RpcResult,
  SessionResult,
} from "../../shared/rpc-contract.js";
import type { SearchResponse } from "../../shared/search.js";
import { SessionExchangeValidationError } from "../../shared/session-exchange.js";
import { remoteEntry, remoteSearch } from "../remote-view.js";
import { ReviewAttachmentError, ReviewNotFoundError } from "../review-store.js";
import { SessionImportValidationError } from "../session-import.js";
import { WorkspaceError } from "../workspace-state.js";
import {
  type CommandEffects,
  type CommandOptions,
  createCommandContext,
} from "./context.js";
import { CommandError, domainError } from "./errors.js";
import { markdownCommands } from "./markdown.js";
import { pickerCommands } from "./pickers.js";
import { queryCommands } from "./queries.js";
import { reviewCommands } from "./review.js";
import { type CommandHandlers, sessionCommands } from "./session.js";
import { commandParams, isCommandMethod } from "./validation.js";
import { viewerCommands } from "./viewer.js";
import { workspaceCommands } from "./workspaces.js";

/** 外の端末に許す操作。閲覧に必要な読取りだけで、LLM との通信とローカル専用の操作を含まない。 */
const REMOTE_METHODS: ReadonlySet<RpcMethod> = new Set<RpcMethod>([
  "server.health",
  "session.get",
  "workspaces.list",
  "workspaces.get",
  "search.query",
]);
/**
 * 外の端末へ返す結果に変える。絶対パスとネイティブのファイル選択を渡さない。
 * @param method - 実行した操作
 * @param result - 操作の結果
 * @returns 外の端末へ返す結果
 */
function remoteResult(method: RpcMethod, result: unknown): unknown {
  if (method === "session.get") {
    const session = result as SessionResult;
    return {
      ...session,
      entries: session.entries.map(remoteEntry),
      filePicker: { available: false },
      directoryPicker: { available: false },
      access: "remote",
    } satisfies SessionResult;
  }
  if (method === "workspaces.get") {
    const workspace = result as RpcResult<"workspaces.get">;
    return { ...workspace, entries: workspace.entries.map(remoteEntry) };
  }
  if (method === "search.query") return remoteSearch(result as SearchResponse);
  return result;
}
/** Shared validated command entry point. */
export interface Commands {
  execute<M extends RpcMethod>(
    method: M,
    params: unknown,
    effects: CommandEffects,
    access?: RpcAccess,
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
    ...markdownCommands(context),
    ...reviewCommands(context),
    ...viewerCommands(context),
  };
  return {
    has: isCommandMethod,
    async execute<M extends RpcMethod>(
      method: M,
      rawParams: unknown,
      effects: CommandEffects,
      access: RpcAccess = "local",
    ): Promise<RpcResult<M>> {
      if (!isCommandMethod(method))
        throw new CommandError(-32601, "Method not found");
      if (access === "remote" && !REMOTE_METHODS.has(method))
        throw domainError(
          "forbidden",
          "This operation is not available from a remote device.",
        );
      const params = commandParams(method, rawParams);
      try {
        if (method !== "server.health") {
          const { instanceId } = params as { instanceId?: string };
          if (instanceId !== undefined) context.identity(instanceId, true);
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
        return (
          access === "remote" ? remoteResult(method, result) : result
        ) as RpcResult<M>;
      } catch (error) {
        if (error instanceof CommandError) throw error;
        if (error instanceof ReviewNotFoundError)
          throw domainError("notFound", error.message);
        if (error instanceof ReviewAttachmentError)
          throw new CommandError(-32602, error.message);
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
