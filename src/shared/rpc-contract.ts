import type { Entry, Session } from "../server/session.js";
import type { EntryAddition } from "../server/session-add.js";
import type {
  Workspace,
  WorkspaceState,
  WorkspaceSummary,
} from "../server/workspace-state.js";
import type { AgentContext, BrowserAgentContext } from "./agent-context.js";
import type {
  ActiveReview,
  ReviewAttachmentUpload,
  ReviewAuthor,
  ReviewClient,
  ReviewEvent,
  ReviewStates,
  ReviewThread,
  TextAnchor,
} from "./review.js";
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
  forbidden: 1008,
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
/** 要求の接続元。`remote` は `--host` で受け付けた外の端末で、閲覧だけを許す。 */
export type RpcAccess = "local" | "remote";
/** Session snapshot with server capabilities. */
export interface SessionResult extends Session, WorkspaceState {
  access?: RpcAccess;
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
  "review.list": {
    params: WorkspaceParams & { entryId: string };
    result: { threads: ReviewThread[] };
  };
  "review.create": {
    params: WorkspaceParams & {
      entryId: string;
      anchor: TextAnchor | null;
      author: ReviewAuthor;
      body: string;
      attachments?: ReviewAttachmentUpload[];
    };
    result: ReviewThread;
  };
  "review.reply": {
    params: RequestContext & {
      threadId: string;
      author: ReviewAuthor;
      body: string;
      attachments?: ReviewAttachmentUpload[];
      /** Edited text the thread moves to; must appear once in the file. */
      quote?: string;
    };
    result: ReviewThread;
  };
  "review.get": {
    params: RequestContext & { threadId: string };
    result: {
      thread: ReviewThread;
      file: { id: string; title: string; path: string };
    };
  };
  "review.resolve": {
    params: RequestContext & { threadId: string; resolved: boolean };
    result: ReviewThread;
  };
  "review.request": {
    params: WorkspaceParams & { entryId: string };
    result: { text: string };
  };
  "review.start": {
    params: WorkspaceParams & {
      entryId: string;
      session: string;
      client?: ReviewClient;
    };
    result: ActiveReview;
  };
  "review.finish": {
    params: RequestContext & { reviewId: string };
    result: null;
  };
  "review.states": {
    params: RequestContext;
    result: ReviewStates;
  };
  "review.take": {
    params: RequestContext & { session: string; entryId?: string };
    result: { events: ReviewEvent[] };
  };
  "viewer.show": {
    params: WorkspaceParams & { entryId: string };
    result: { shown: boolean };
  };
  "search.query": {
    params: RequestContext & { query: string; workspaceId?: string };
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
