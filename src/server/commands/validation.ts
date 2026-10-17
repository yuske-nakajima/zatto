import { z } from "zod";
import { REVIEW_LIMITS } from "../../shared/review.js";
import type { RpcMethod, RpcParams } from "../../shared/rpc-contract.js";
import { CommandError } from "./errors.js";

const id = z.string().min(1);
const workspaceId = id;
const instanceId = id.optional();
const ids = z.array(id);
const name = z.string().trim().min(1).max(100);
const empty = z.strictObject({});
const reviewBody = z.string().trim().min(1).max(REVIEW_LIMITS.bodyLength);
const session = z.string().trim().min(1).max(100);
const author = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({ kind: z.literal("llm"), session: session.optional() }),
]);
const context = z.string().max(REVIEW_LIMITS.contextLength);
const anchor = z
  .strictObject({
    exact: z.string().min(1).max(REVIEW_LIMITS.anchorTextLength),
    prefix: context,
    suffix: context,
  })
  .nullable();
const guards = { instanceId };
const schemas = {
  "server.health": empty,
  "server.shutdown": z.strictObject(guards),
  "session.get": z.strictObject(guards),
  "session.add": z.strictObject({
    ...guards,
    paths: z.array(z.string().min(1)),
    workspaceId,
  }),
  "session.setFavorite": z.strictObject({
    ...guards,
    id,
    favorite: z.boolean(),
    workspaceId,
  }),
  "session.reorder": z.strictObject({ ...guards, ids, workspaceId }),
  "session.removeMany": z.strictObject({
    ...guards,
    ids: ids.min(1).refine((values) => new Set(values).size === values.length),
    workspaceId,
  }),
  "session.remove": z.strictObject({ ...guards, id, workspaceId }),
  "session.clear": z.strictObject({ ...guards, workspaceId }),
  "session.export": z.strictObject({ ...guards, workspaceId }),
  "session.import": z.strictObject({
    ...guards,
    exchange: z.unknown(),
    mode: z.enum(["replace", "merge"]).optional(),
    instanceId,
    workspaceId,
  }),
  "session.pickFiles": z.strictObject({
    ...guards,
    instanceId: id,
    workspaceId,
  }),
  "session.pickDirectory": z.strictObject({
    ...guards,
    instanceId: id,
    mode: z.enum(["direct", "recursive"]),
    workspaceId,
  }),
  "workspaces.list": z.strictObject(guards),
  "workspaces.get": z.strictObject({ ...guards, id }),
  "workspaces.create": z.strictObject({ ...guards, name }),
  "workspaces.activate": z.strictObject({ ...guards, id }),
  "workspaces.rename": z.strictObject({ ...guards, id, name }),
  "workspaces.delete": z.strictObject({ ...guards, id }),
  "agentContext.get": z.strictObject(guards),
  "agentContext.set": z.strictObject({
    ...guards,
    activeEntryId: id.nullable(),
    view: z.enum(["preview", "search", "docs"]),
    workspaceId,
  }),
  "markdown.setTask": z.strictObject({
    ...guards,
    workspaceId,
    id,
    index: z.number().int().min(0),
    checked: z.boolean(),
    revision: id,
  }),
  "review.list": z.strictObject({ ...guards, workspaceId, entryId: id }),
  "review.create": z.strictObject({
    ...guards,
    workspaceId,
    entryId: id,
    anchor,
    author,
    body: reviewBody,
  }),
  "review.reply": z.strictObject({
    ...guards,
    threadId: id,
    author,
    body: reviewBody,
  }),
  "review.edit": z.strictObject({
    ...guards,
    threadId: id,
    commentId: id,
    body: reviewBody,
  }),
  "review.delete": z.strictObject({ ...guards, threadId: id, commentId: id }),
  "review.resolve": z.strictObject({
    ...guards,
    threadId: id,
    resolved: z.boolean(),
  }),
  "review.start": z.strictObject({
    ...guards,
    workspaceId,
    entryId: id,
    session,
  }),
  "review.finish": z.strictObject({ ...guards, reviewId: id }),
  "review.states": z.strictObject(guards),
  "review.take": z.strictObject({
    ...guards,
    session,
    entryId: id.optional(),
  }),
  "search.query": z.strictObject({ ...guards, query: z.string() }),
} satisfies Record<RpcMethod, z.ZodType>;
/**
 * Validates command names using own-property membership.
 * @param value - Requested method name
 * @returns Whether a supported method exists
 * @throws Never
 */
export function isCommandMethod(value: string): value is RpcMethod {
  return Object.hasOwn(schemas, value);
}
/**
 * Validates named parameters for any command entry point.
 * @param method - Known command name
 * @param params - Untrusted parameters
 * @returns Typed normalized parameters
 * @throws CommandError when parameters are invalid
 */
export function commandParams<M extends RpcMethod>(
  method: M,
  params: unknown,
): RpcParams<M> {
  const result = schemas[method].safeParse(params);
  if (!result.success)
    throw new CommandError(-32602, "Invalid params", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  return result.data as RpcParams<M>;
}
