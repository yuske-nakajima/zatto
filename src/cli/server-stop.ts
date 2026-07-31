import {
  readServerRecord,
  removeOwnedServerRecord,
  type ServerRecord,
} from "../server/runtime.js";
import { probeHealth, requestShutdown } from "./server-api.js";
import {
  recoverRecordFromLock,
  type ServerClientDependencies,
} from "./server-client.js";
import { findUnmanagedServer } from "./server-discovery.js";

const STOP_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 100;

type StopDependencies = Pick<
  ServerClientDependencies,
  "fetch" | "runtimeFilePath" | "wait"
>;

export async function stopRecordedServer(
  preferredPort: number,
  dependencies: StopDependencies,
): Promise<{ port: number; stopped: boolean }> {
  const record =
    (await readServerRecord(dependencies.runtimeFilePath)) ??
    (await recoverRecordFromLock(dependencies));
  if (record) {
    const probe = await probeHealth(record.port, dependencies.fetch, record);
    if (
      probe.kind === "compatible" ||
      probe.kind === "same-instance-incompatible"
    ) {
      await requestShutdown(record.port, dependencies.fetch, record.instanceId);
      await waitForStopped(record, dependencies);
      return { port: record.port, stopped: true };
    }
    if (probe.kind === "different-instance") {
      throw new Error(
        `記録された zatto サーバーと互換性を確認できませんでした (${record.port})`,
      );
    }
    await removeOwnedServerRecord(
      dependencies.runtimeFilePath,
      record.instanceId,
      record.processFingerprint,
    );
  }

  const unmanaged = await findUnmanagedServer(
    preferredPort,
    dependencies.fetch,
  );
  if (!unmanaged) return { port: preferredPort, stopped: false };
  const instanceId =
    "identity" in unmanaged.probe &&
    typeof unmanaged.probe.identity.instanceId === "string"
      ? unmanaged.probe.identity.instanceId
      : undefined;
  await requestShutdown(unmanaged.port, dependencies.fetch, instanceId);
  await waitForUnmanagedStopped(unmanaged.port, dependencies);
  return { port: unmanaged.port, stopped: true };
}

async function waitForStopped(
  target: ServerRecord,
  dependencies: StopDependencies,
): Promise<void> {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const record = await readServerRecord(dependencies.runtimeFilePath);
    const probe = await probeHealth(target.port, dependencies.fetch, target);
    if (
      record?.instanceId !== target.instanceId ||
      probe.kind === "unreachable"
    ) {
      return;
    }
    await dependencies.wait(POLL_INTERVAL_MS);
  }
  throw new Error(
    `zatto サーバーの停止がタイムアウトしました (${target.port})`,
  );
}

async function waitForUnmanagedStopped(
  port: number,
  dependencies: Pick<ServerClientDependencies, "fetch" | "wait">,
): Promise<void> {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await probeHealth(port, dependencies.fetch)).kind === "unreachable") {
      return;
    }
    await dependencies.wait(POLL_INTERVAL_MS);
  }
  throw new Error(`zatto サーバーの停止がタイムアウトしました (${port})`);
}
