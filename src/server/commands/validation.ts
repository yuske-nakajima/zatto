import { z } from "zod";
import type { RpcMethod, RpcParams } from "../../shared/rpc-contract.js";
import { CommandError } from "./errors.js";

const id = z.string().min(1);
const workspaceId = id.optional();
const instanceId = id.optional();
const ids = z.array(id);
const name = z.string().trim().min(1).max(100);
const empty = z.strictObject({});
const guards = { workspaceId, instanceId };
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
  "session.export": z.strictObject(guards),
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
