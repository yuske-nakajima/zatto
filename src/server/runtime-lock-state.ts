import { mkdir, rename, rm, stat } from "node:fs/promises";
import {
  readLockOwner,
  type ServerLockOwner,
  writeLockOwner,
} from "./runtime-lock-io.js";

export const LOCK_LEASE_MS = 10_000;

export async function lockIsStale(lockPath: string): Promise<boolean> {
  const owner = await readLockOwner(lockPath);
  if (owner) {
    return !serverProcessIsAlive(owner.pid);
  }
  try {
    const age = Date.now() - (await stat(lockPath)).mtimeMs;
    return age >= LOCK_LEASE_MS || age <= -LOCK_LEASE_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

export async function reclaimStaleLock(
  lockPath: string,
  owner: ServerLockOwner,
): Promise<boolean> {
  const reclaimPath = `${lockPath}.reclaim`;
  if (!(await acquireReclaimLock(reclaimPath, owner))) return false;
  const quarantined = `${lockPath}.stale-${owner.processFingerprint}`;
  try {
    if (!(await lockIsStale(lockPath))) return false;
    try {
      await rename(lockPath, quarantined);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    await rm(quarantined, { recursive: true, force: true });
    return true;
  } finally {
    await releaseOwnedLockDirectory(reclaimPath, owner);
  }
}

export async function releaseOwnedLockDirectory(
  lockPath: string,
  owner: Pick<ServerLockOwner, "instanceId" | "processFingerprint">,
): Promise<void> {
  const quarantined = `${lockPath}.release-${owner.processFingerprint}`;
  try {
    await rename(lockPath, quarantined);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const moved = await readLockOwner(quarantined);
  if (
    moved?.instanceId === owner.instanceId &&
    moved.processFingerprint === owner.processFingerprint
  ) {
    await rm(quarantined, { recursive: true, force: true });
    return;
  }
  try {
    await rename(quarantined, lockPath);
  } catch (error) {
    if (
      !new Set(["EEXIST", "ENOTEMPTY"]).has(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      throw error;
    }
    await rm(quarantined, { recursive: true, force: true });
  }
}

export function serverProcessIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function acquireReclaimLock(
  reclaimPath: string,
  owner: ServerLockOwner,
): Promise<boolean> {
  try {
    await mkdir(reclaimPath, { mode: 0o700 });
    await writeLockOwner(reclaimPath, owner);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (!(await lockIsStale(reclaimPath))) return false;
  const stalePath = `${reclaimPath}.stale-${owner.processFingerprint}`;
  const observed = await readLockOwner(reclaimPath);
  try {
    await rename(reclaimPath, stalePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const moved = await readLockOwner(stalePath);
  if (observed && moved?.processFingerprint !== observed.processFingerprint) {
    try {
      await rename(stalePath, reclaimPath);
    } catch {
      return false;
    }
    return false;
  }
  await rm(stalePath, { recursive: true, force: true });
  try {
    await mkdir(reclaimPath, { mode: 0o700 });
    await writeLockOwner(reclaimPath, owner);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export {
  readLockOwner,
  readServerLockState,
  type ServerLockOwner,
  type ServerLockState,
  updateServerLockState,
  writeLockOwner,
} from "./runtime-lock-io.js";
