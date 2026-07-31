import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ServerLockOwner {
  instanceId: string;
  pid: number;
  processFingerprint: string;
  acquiredAt: number;
}

export interface ServerLockState extends ServerLockOwner {
  heartbeatAt: number;
  port?: number;
  protocolVersion?: number;
}

export async function writeLockOwner(
  lockPath: string,
  owner: ServerLockOwner,
): Promise<void> {
  try {
    await writeFile(
      path.join(lockPath, "owner.json"),
      `${JSON.stringify(owner)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    await writeLockState(lockPath, { ...owner, heartbeatAt: owner.acquiredAt });
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true });
    throw error;
  }
}

export async function readLockOwner(
  lockPath: string,
): Promise<ServerLockOwner | null> {
  return readJson(path.join(lockPath, "owner.json"), isServerLockOwner);
}

export async function readServerLockState(
  runtimeFilePath: string,
): Promise<ServerLockState | null> {
  const lockPath = `${runtimeFilePath}.lock`;
  const owner = await readLockOwner(lockPath);
  if (!owner) return null;
  const state = await readJson(
    lockStatePath(lockPath, owner.processFingerprint),
    isServerLockState,
  );
  return state?.processFingerprint === owner.processFingerprint ? state : null;
}

export async function updateServerLockState(
  runtimeFilePath: string,
  processFingerprint: string,
  patch: Partial<
    Pick<ServerLockState, "heartbeatAt" | "port" | "protocolVersion">
  >,
): Promise<boolean> {
  const lockPath = `${runtimeFilePath}.lock`;
  const owner = await readLockOwner(lockPath);
  if (owner?.processFingerprint !== processFingerprint) return false;
  const current = await readServerLockState(runtimeFilePath);
  if (!current) return false;
  await writeLockState(lockPath, { ...current, ...patch });
  return (
    (await readLockOwner(lockPath))?.processFingerprint === processFingerprint
  );
}

export async function readLockState(
  lockPath: string,
  owner: ServerLockOwner,
): Promise<ServerLockState | null> {
  return readJson(
    lockStatePath(lockPath, owner.processFingerprint),
    isServerLockState,
  );
}

async function writeLockState(
  lockPath: string,
  state: ServerLockState,
): Promise<void> {
  const target = lockStatePath(lockPath, state.processFingerprint);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
}

function lockStatePath(lockPath: string, fingerprint: string): string {
  return path.join(lockPath, `state-${fingerprint}.json`);
}

async function readJson<T>(
  filePath: string,
  guard: (value: unknown) => value is T,
): Promise<T | null> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return guard(value) ? value : null;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    ) {
      return null;
    }
    throw error;
  }
}

function isServerLockOwner(value: unknown): value is ServerLockOwner {
  if (typeof value !== "object" || value === null) return false;
  const owner = value as Record<string, unknown>;
  return (
    typeof owner.instanceId === "string" &&
    typeof owner.processFingerprint === "string" &&
    typeof owner.pid === "number" &&
    Number.isInteger(owner.pid) &&
    typeof owner.acquiredAt === "number"
  );
}

function isServerLockState(value: unknown): value is ServerLockState {
  return (
    isServerLockOwner(value) &&
    typeof (value as ServerLockState).heartbeatAt === "number"
  );
}
