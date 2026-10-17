import { APP_NAME } from "../meta.js";
import {
  SERVER_PROTOCOL_VERSION,
  type ServerRecord,
} from "../server/runtime.js";
import { rpcCall } from "../shared/rpc-client.js";
import {
  parseSessionExchange,
  type SessionExchange,
} from "../shared/session-exchange.js";

const HEALTH_TIMEOUT_MS = 750;

export interface HealthIdentity {
  name?: unknown;
  instanceId?: unknown;
  protocolVersion?: unknown;
}

export type HealthProbe =
  | { kind: "compatible"; identity: HealthIdentity }
  | { kind: "same-instance-incompatible"; identity: HealthIdentity }
  | { kind: "different-instance"; identity: HealthIdentity }
  | { kind: "legacy" }
  | { kind: "other" }
  | { kind: "unreachable" };

export async function probeHealth(
  port: number,
  fetchFn: typeof globalThis.fetch,
  expected?: ServerRecord,
): Promise<HealthProbe> {
  let identity: HealthIdentity;
  try {
    identity = await rpcCall(
      "server.health",
      {},
      {
        endpoint: `${serverUrl(port)}rpc`,
        fetch: fetchFn,
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      },
    );
  } catch {
    try {
      const legacy = await fetchFn(`${serverUrl(port)}api/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!legacy.ok) return { kind: "other" };
      identity = (await legacy.json()) as HealthIdentity;
      if (identity.name !== APP_NAME) return { kind: "other" };
      if (
        expected &&
        typeof identity.instanceId === "string" &&
        identity.instanceId !== expected.instanceId
      )
        return { kind: "different-instance", identity };
      return { kind: "legacy" };
    } catch {
      return { kind: "unreachable" };
    }
  }
  if (identity.name !== APP_NAME) {
    return { kind: "other" };
  }
  if (
    typeof identity.instanceId !== "string" ||
    typeof identity.protocolVersion !== "number"
  ) {
    return { kind: "legacy" };
  }
  if (expected && identity.instanceId !== expected.instanceId)
    return { kind: "different-instance", identity };
  if (identity.protocolVersion !== SERVER_PROTOCOL_VERSION)
    return { kind: "same-instance-incompatible", identity };
  return { kind: "compatible", identity };
}

export async function requestShutdown(
  port: number,
  fetchFn: typeof globalThis.fetch,
  instanceId?: string,
): Promise<void> {
  await rpcCall(
    "server.shutdown",
    { ...(instanceId ? { instanceId } : {}) },
    {
      endpoint: `${serverUrl(port)}rpc`,
      fetch: fetchFn,
    },
  );
}

/**
 * Replaces the managed server session from an exchange document.
 *
 * @param record - Runtime identity of the target server
 * @param exchange - Validated session exchange document
 * @param fetchFn - Fetch implementation used for the request
 * @returns A promise that resolves after the server accepts the session
 * @throws {Error} When the server rejects the import
 */
export async function importSession(
  record: ServerRecord,
  exchange: SessionExchange,
  fetchFn: typeof globalThis.fetch,
): Promise<void> {
  await rpcCall(
    "session.import",
    { exchange, instanceId: record.instanceId },
    {
      endpoint: `${serverUrl(record.port)}rpc`,
      fetch: fetchFn,
    },
  );
}

/**
 * Fetches the managed server session as an exchange document.
 *
 * @param record - Runtime identity of the target server
 * @param fetchFn - Fetch implementation used for the request
 * @returns The validated session exchange document
 * @throws {Error} When the server rejects the export or returns invalid JSON
 */
export async function exportSession(
  record: ServerRecord,
  fetchFn: typeof globalThis.fetch,
): Promise<SessionExchange> {
  return parseSessionExchange(
    await rpcCall(
      "session.export",
      { instanceId: record.instanceId },
      {
        endpoint: `${serverUrl(record.port)}rpc`,
        fetch: fetchFn,
      },
    ),
  );
}

/** Migration instructions never invoke legacy write operations from this client. */
export function legacyServerMessage(port: number): string {
  return `旧 zatto サーバーが起動しています (${port})。更新前の zatto --port ${port} --stop、または npx --yes @yuske-nakajima/zatto@1.2.0 --port ${port} --stop で停止してから、新版を起動してください。`;
}

export function serverUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}
