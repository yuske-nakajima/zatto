import { parseAgentContext } from "./agent-context.js";
import type { RpcMethod, RpcResult } from "./rpc-contract.js";
import { parseSessionExchange } from "./session-exchange.js";

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown) => typeof value === "string";
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const boolean = (value: unknown) => typeof value === "boolean";
const list = (value: unknown, valid: (item: unknown) => boolean) =>
  Array.isArray(value) && value.every(valid);
function entry(value: unknown): boolean {
  return (
    object(value) &&
    text(value.id) &&
    text(value.title) &&
    text(value.absPath) &&
    number(value.addedAt) &&
    (value.favorite === undefined || boolean(value.favorite))
  );
}
function session(value: unknown): value is Record<string, unknown> {
  return object(value) && list(value.entries, entry);
}
function workspace(value: unknown): boolean {
  return object(value) && text(value.id) && text(value.name);
}
function workspaces(value: unknown): boolean {
  return (
    object(value) &&
    text(value.activeWorkspaceId) &&
    list(value.workspaces, workspace)
  );
}
function capability(value: unknown): boolean {
  return (
    object(value) &&
    boolean(value.available) &&
    (value.instanceId === undefined || text(value.instanceId))
  );
}
function line(value: unknown): boolean {
  return (
    object(value) &&
    number(value.lineNumber) &&
    number(value.startOffset) &&
    text(value.lineText) &&
    boolean(value.truncated) &&
    list(
      value.ranges,
      (range) => object(range) && number(range.start) && number(range.length),
    )
  );
}
function search(value: unknown): boolean {
  return (
    object(value) &&
    text(value.query) &&
    number(value.totalMatches) &&
    boolean(value.truncated) &&
    list(
      value.files,
      (file) =>
        object(file) &&
        text(file.entryId) &&
        text(file.title) &&
        text(file.fileName) &&
        text(file.absPath) &&
        number(file.matchCount) &&
        boolean(file.truncated) &&
        list(file.lines, line),
    )
  );
}
/** Validates command results before clients consume untrusted wire data. */
export function isRpcResult<M extends RpcMethod>(
  method: M,
  value: unknown,
): value is RpcResult<M> {
  switch (method) {
    case "server.health":
      return (
        object(value) &&
        text(value.name) &&
        text(value.version) &&
        (value.instanceId === undefined || text(value.instanceId)) &&
        (value.protocolVersion === undefined || number(value.protocolVersion))
      );
    case "server.shutdown":
      return object(value) && value.ok === true;
    case "session.get":
      return (
        session(value) &&
        workspaces(value) &&
        capability(value.filePicker) &&
        capability(value.directoryPicker) &&
        (value.serverIdentity === undefined ||
          (object(value.serverIdentity) &&
            text(value.serverIdentity.instanceId)))
      );
    case "session.add":
      return (
        object(value) &&
        list(value.added, entry) &&
        list(value.resolved, entry) &&
        text(value.workspaceId) &&
        text(value.activeWorkspaceId) &&
        session(value.session)
      );
    case "session.pickFiles":
    case "session.pickDirectory":
      return (
        object(value) &&
        boolean(value.cancelled) &&
        list(value.added, entry) &&
        (value.session === undefined || session(value.session))
      );
    case "session.import":
      return session(value);
    case "session.export":
      try {
        parseSessionExchange(value);
        return true;
      } catch {
        return false;
      }
    case "workspaces.list":
    case "workspaces.rename":
      return workspaces(value);
    case "workspaces.get":
      return workspace(value) && session(value);
    case "workspaces.create":
      return workspace(value);
    case "workspaces.activate":
    case "workspaces.delete":
      return session(value) && workspaces(value);
    case "agentContext.get":
      try {
        parseAgentContext(value);
        return true;
      } catch {
        return false;
      }
    case "search.query":
      return search(value);
    case "session.setFavorite":
    case "session.reorder":
    case "session.removeMany":
    case "session.remove":
    case "session.clear":
    case "agentContext.set":
      return value === null;
    default: {
      const exhaustive: never = method;
      return exhaustive;
    }
  }
}
