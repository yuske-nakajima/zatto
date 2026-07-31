import { APP_NAME } from "../meta.js";
import {
  SERVER_PROTOCOL_VERSION,
  type ServerRecord,
} from "../server/runtime.js";

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
  let response: Response;
  try {
    response = await fetchFn(`${serverUrl(port)}api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
  } catch {
    return { kind: "unreachable" };
  }
  if (!response.ok) {
    return { kind: "other" };
  }

  let identity: HealthIdentity;
  try {
    identity = (await response.json()) as HealthIdentity;
  } catch {
    return { kind: "other" };
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
  const response = await fetchFn(`${serverUrl(port)}api/shutdown`, {
    method: "POST",
    ...(instanceId
      ? { headers: { "x-zatto-instance-id": instanceId } }
      : undefined),
  });
  if (!response.ok) {
    throw new Error(`サーバーの停止に失敗しました (HTTP ${response.status})`);
  }
}

export async function addFiles(
  record: ServerRecord,
  files: string[],
  fetchFn: typeof globalThis.fetch,
): Promise<void> {
  const response = await fetchFn(`${serverUrl(record.port)}api/session/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paths: files }),
  });
  if (!response.ok) {
    throw new Error(`ファイルの追加に失敗しました (HTTP ${response.status})`);
  }
}

export function serverUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}
