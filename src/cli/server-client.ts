import {
  createServerRecordIfAbsent,
  readServerLockState,
  readServerRecord,
  removeOwnedServerRecord,
  type ServerRecord,
  serverProcessIsAlive,
} from "../server/runtime.js";
import { probeHealth } from "./server-api.js";
import { findUnmanagedServer } from "./server-discovery.js";

const STARTUP_TIMEOUT_MS = 7_000;
const POLL_INTERVAL_MS = 100;

export interface ServerClientDependencies {
  fetch: typeof globalThis.fetch;
  spawnServer: (
    port: number,
    instanceId: string,
    runtimeFilePath: string,
  ) => Promise<void> | void;
  wait: (milliseconds: number) => Promise<void>;
  runtimeFilePath: string;
  createInstanceId: () => string;
}

interface ServerConnection {
  record: ServerRecord;
  started: boolean;
}

export async function connectOrStartServer(
  preferredPort: number,
  dependencies: ServerClientDependencies,
): Promise<ServerConnection> {
  const existing = await resolveManagedServer(dependencies);
  if (existing) return { record: existing, started: false };

  const locked = await readServerLockState(dependencies.runtimeFilePath);
  if (locked && serverProcessIsAlive(locked.pid)) {
    const recovered = await waitForLockRecovery(dependencies);
    if (recovered) return { record: recovered, started: false };
    if (serverProcessIsAlive(locked.pid)) {
      throw new Error(
        `既存の zatto サーバーが応答しません (PID ${locked.pid})。プロセスを停止してから再実行してください`,
      );
    }
  }

  const unmanaged = await findUnmanagedServer(
    preferredPort,
    dependencies.fetch,
  );
  if (unmanaged) {
    throw new Error(
      `runtime recordのない zatto サーバーがポート ${unmanaged.port} で起動しています。` +
        "`zatto --stop` で停止してから再実行してください",
    );
  }

  const instanceId = dependencies.createInstanceId();
  await dependencies.spawnServer(
    preferredPort,
    instanceId,
    dependencies.runtimeFilePath,
  );
  const record = await waitForServer(dependencies);
  return { record, started: record.instanceId === instanceId };
}

async function resolveManagedServer(
  dependencies: Pick<ServerClientDependencies, "fetch" | "runtimeFilePath">,
): Promise<ServerRecord | null> {
  const record = await readServerRecord(dependencies.runtimeFilePath);
  if (!record) return recoverRecordFromLock(dependencies);
  const probe = await probeHealth(record.port, dependencies.fetch, record);
  if (probe.kind === "compatible") return record;
  if (
    probe.kind === "same-instance-incompatible" ||
    probe.kind === "different-instance"
  ) {
    throw new Error(
      `記録された zatto サーバーと互換性を確認できませんでした (${record.port})`,
    );
  }
  await removeOwnedServerRecord(
    dependencies.runtimeFilePath,
    record.instanceId,
    record.processFingerprint,
  );
  return recoverRecordFromLock(dependencies);
}

export async function recoverRecordFromLock(
  dependencies: Pick<ServerClientDependencies, "fetch" | "runtimeFilePath">,
): Promise<ServerRecord | null> {
  const state = await readServerLockState(dependencies.runtimeFilePath);
  if (!state?.port || state.protocolVersion === undefined) return null;
  const record: ServerRecord = {
    instanceId: state.instanceId,
    processFingerprint: state.processFingerprint,
    pid: state.pid,
    port: state.port,
    protocolVersion: state.protocolVersion,
  };
  if (
    (await probeHealth(record.port, dependencies.fetch, record)).kind !==
    "compatible"
  ) {
    return null;
  }
  await createServerRecordIfAbsent(dependencies.runtimeFilePath, record);
  return (await readServerRecord(dependencies.runtimeFilePath)) ?? record;
}

async function waitForServer(
  dependencies: ServerClientDependencies,
): Promise<ServerRecord> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const record = await resolveManagedServer(dependencies);
    if (record) return record;
    await dependencies.wait(POLL_INTERVAL_MS);
  }
  throw new Error("zatto サーバーの起動がタイムアウトしました");
}

async function waitForLockRecovery(
  dependencies: ServerClientDependencies,
): Promise<ServerRecord | null> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const record = await recoverRecordFromLock(dependencies);
    if (record) return record;
    await dependencies.wait(POLL_INTERVAL_MS);
  }
  return null;
}
