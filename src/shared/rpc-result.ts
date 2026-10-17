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
function reviewThread(value: unknown): boolean {
  return (
    object(value) &&
    text(value.id) &&
    text(value.entryId) &&
    boolean(value.resolved) &&
    number(value.createdAt) &&
    (value.anchor === null ||
      (object(value.anchor) &&
        text(value.anchor.exact) &&
        text(value.anchor.prefix) &&
        text(value.anchor.suffix))) &&
    list(
      value.comments,
      (comment) =>
        object(comment) &&
        text(comment.id) &&
        text(comment.body) &&
        number(comment.createdAt) &&
        object(comment.author) &&
        (comment.author.kind === "user" || comment.author.kind === "llm"),
    )
  );
}
function activeReview(value: unknown): boolean {
  return (
    object(value) &&
    text(value.id) &&
    text(value.entryId) &&
    text(value.workspaceId) &&
    text(value.session) &&
    number(value.createdAt)
  );
}
function reviewEvent(value: unknown): boolean {
  return (
    object(value) &&
    text(value.reviewId) &&
    text(value.entryId) &&
    text(value.workspaceId) &&
    ((value.kind === "comment" && text(value.threadId)) ||
      value.kind === "finished")
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
    case "review.list":
      return object(value) && list(value.threads, reviewThread);
    case "review.create":
    case "review.reply":
    case "review.edit":
    case "review.resolve":
      return reviewThread(value);
    case "review.delete":
      return value === null || reviewThread(value);
    case "review.start":
      return activeReview(value);
    case "review.states":
      return (
        object(value) &&
        list(value.reviews, activeReview) &&
        object(value.openThreadCounts) &&
        Object.values(value.openThreadCounts).every(number)
      );
    case "review.take":
      return object(value) && list(value.events, reviewEvent);
    case "review.finish":
      return value === null;
    case "markdown.setTask":
      return object(value) && text(value.revision);
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
