import type { Entry, Session } from "../server/session.js";
import type { EntryAddition } from "../server/session-add.js";
import type {
  Workspace,
  WorkspaceState,
  WorkspaceSummary,
} from "../server/workspace-state.js";
import type { AgentContext, BrowserAgentContext } from "./agent-context.js";
import type { SearchResponse } from "./search.js";
import type { SessionExchange } from "./session-exchange.js";

/** JSON-RPC request identifiers; omitted IDs denote notifications. */
export type RpcId = string | number | null;
/** Common JSON-RPC error envelope. */
export interface RpcErrorData {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}
/** Shared application error codes. */
export const RPC_ERROR = {
  notFound: 1001,
  workspace: 1002,
  instance: 1003,
  pickerUnavailable: 1004,
  busy: 1005,
  searchLimit: 1006,
  conflict: 1007,
} as const;
/** Empty named parameters. */
export type EmptyParams = Record<string, never>;
/** Optional server identity precondition for command invocation. */
export interface RequestContext {
  instanceId?: string;
}
/** Commands that change files of the named workspace, selected or not. */
export interface WorkspaceParams extends RequestContext {
  workspaceId: string;
}
/** Session snapshot with server capabilities. */
export interface SessionResult extends Session, WorkspaceState {
  serverIdentity?: { instanceId: string };
  filePicker: { available: boolean; instanceId?: string };
  directoryPicker: { available: boolean; instanceId?: string };
}
/** Native picker result, retaining its cancellation and addition semantics. */
export interface PickerResult {
  cancelled: boolean;
  added: Entry[];
  session?: Session;
}
/** Parameter and result contracts for every supported command. */
export interface RpcMethods {
  "server.health": {
    params: EmptyParams;
    result: {
      name: string;
      version: string;
      instanceId?: string;
      protocolVersion?: number;
    };
  };
  "server.shutdown": { params: RequestContext; result: { ok: true } };
  "session.get": { params: RequestContext; result: SessionResult };
  "session.add": {
    params: WorkspaceParams & { paths: string[] };
    result: EntryAddition & { activeWorkspaceId: string; session: Session };
  };
  "session.setFavorite": {
    params: WorkspaceParams & { id: string; favorite: boolean };
    result: null;
  };
  "session.reorder": {
    params: WorkspaceParams & { ids: string[] };
    result: null;
  };
  "session.removeMany": {
    params: WorkspaceParams & { ids: string[] };
    result: null;
  };
  "session.remove": { params: WorkspaceParams & { id: string }; result: null };
  "session.clear": { params: WorkspaceParams; result: null };
  "session.export": { params: WorkspaceParams; result: SessionExchange };
  "session.import": {
    params: WorkspaceParams & {
      exchange: SessionExchange;
      mode?: "replace" | "merge";
    };
    result: Session;
  };
  "session.pickFiles": {
    params: WorkspaceParams & { instanceId: string };
    result: PickerResult;
  };
  "session.pickDirectory": {
    params: WorkspaceParams & {
      instanceId: string;
      mode: "direct" | "recursive";
    };
    result: PickerResult;
  };
  "workspaces.list": { params: RequestContext; result: WorkspaceState };
  "workspaces.get": {
    params: RequestContext & { id: string };
    result: Workspace;
  };
  "workspaces.create": {
    params: RequestContext & { name: string };
    result: WorkspaceSummary;
  };
  "workspaces.activate": {
    params: RequestContext & { id: string };
    result: Session & WorkspaceState;
  };
  "workspaces.rename": {
    params: RequestContext & { id: string; name: string };
    result: WorkspaceState;
  };
  "workspaces.delete": {
    params: RequestContext & { id: string };
    result: Session & WorkspaceState;
  };
  "agentContext.get": { params: RequestContext; result: AgentContext };
  "agentContext.set": {
    params: WorkspaceParams & BrowserAgentContext;
    result: null;
  };
  "markdown.setTask": {
    params: WorkspaceParams & {
      id: string;
      index: number;
      checked: boolean;
      revision: string;
    };
    result: { revision: string };
  };
  "search.query": {
    params: RequestContext & { query: string };
    result: SearchResponse;
  };
}
/** Names accepted by the command dispatcher. */
export type RpcMethod = keyof RpcMethods;
/** Named arguments for a command. */
export type RpcParams<M extends RpcMethod> = RpcMethods[M]["params"];
/** Successful result for a command. */
export type RpcResult<M extends RpcMethod> = RpcMethods[M]["result"];
/** JSON-RPC wire response. */
export type RpcResponse =
  | { jsonrpc: "2.0"; id: RpcId; result: unknown }
  | { jsonrpc: "2.0"; id: RpcId; error: RpcErrorData };
