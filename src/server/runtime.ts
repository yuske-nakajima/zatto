import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  lockIsStale,
  reclaimStaleLock,
  releaseOwnedLockDirectory,
  type ServerLockOwner,
  writeLockOwner,
} from "./runtime-lock-state.js";
import { removeOwnedServerRecord } from "./runtime-record.js";

type LockOwnerInput = Pick<ServerLockOwner, "instanceId" | "pid"> &
  Partial<Pick<ServerLockOwner, "processFingerprint" | "acquiredAt">>;

export async function acquireServerLock(
  runtimeFilePath: string,
  input: LockOwnerInput,
): Promise<boolean> {
  const owner: ServerLockOwner = {
    ...input,
    processFingerprint: input.processFingerprint ?? input.instanceId,
    acquiredAt: input.acquiredAt ?? Date.now(),
  };
  const lockPath = `${runtimeFilePath}.lock`;
  await mkdir(path.dirname(runtimeFilePath), { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      await writeLockOwner(lockPath, owner);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!(await lockIsStale(lockPath))) return false;
      if (!(await reclaimStaleLock(lockPath, owner))) return false;
    }
  }
  return false;
}

export async function releaseServerRuntime(
  runtimeFilePath: string,
  instanceId: string,
  processFingerprint = instanceId,
): Promise<void> {
  await removeOwnedServerRecord(
    runtimeFilePath,
    instanceId,
    processFingerprint,
  );
  await releaseOwnedLockDirectory(`${runtimeFilePath}.lock`, {
    instanceId,
    processFingerprint,
  });
}

export {
  readServerLockState,
  type ServerLockState,
  serverProcessIsAlive,
  updateServerLockState,
} from "./runtime-lock-state.js";
export {
  createServerRecordIfAbsent,
  DEFAULT_RUNTIME_FILE,
  readServerRecord,
  removeOwnedServerRecord,
  resolveRuntimeFilePath,
  SERVER_PROTOCOL_VERSION,
  type ServerRecord,
  writeServerRecord,
} from "./runtime-record.js";
