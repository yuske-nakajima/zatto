import { randomUUID } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SERVER_PROTOCOL_VERSION = 1;
export const DEFAULT_RUNTIME_FILE = path.join(
  os.homedir(),
  ".config",
  "zatto",
  "server.json",
);

export interface ServerRecord {
  protocolVersion: number;
  instanceId: string;
  processFingerprint: string;
  pid: number;
  port: number;
}

type ServerRecordInput = Omit<ServerRecord, "processFingerprint"> & {
  processFingerprint?: string;
};

export function resolveRuntimeFilePath(): string {
  return process.env.ZATTO_RUNTIME_FILE ?? DEFAULT_RUNTIME_FILE;
}

export async function readServerRecord(
  runtimeFilePath: string,
): Promise<ServerRecord | null> {
  return readRecordAt(runtimeFilePath);
}

export async function writeServerRecord(
  runtimeFilePath: string,
  input: ServerRecordInput,
): Promise<void> {
  const record = normalizeRecord(input);
  const temporaryPath = await writeTemporaryRecord(runtimeFilePath, record);
  await rename(temporaryPath, runtimeFilePath);
}

export async function createServerRecordIfAbsent(
  runtimeFilePath: string,
  input: ServerRecordInput,
): Promise<boolean> {
  const record = normalizeRecord(input);
  const temporaryPath = await writeTemporaryRecord(runtimeFilePath, record);
  try {
    await link(temporaryPath, runtimeFilePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw new Error(
      `runtime recordを作成できませんでした: ${runtimeFilePath}`,
      { cause: error },
    );
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function removeOwnedServerRecord(
  runtimeFilePath: string,
  instanceId: string,
  processFingerprint: string,
): Promise<void> {
  const quarantinePath = `${runtimeFilePath}.release-${processFingerprint}`;
  try {
    await rename(runtimeFilePath, quarantinePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const moved = await readRecordAt(quarantinePath);
  if (
    moved?.instanceId === instanceId &&
    moved.processFingerprint === processFingerprint
  ) {
    await rm(quarantinePath, { force: true });
    return;
  }
  try {
    await link(quarantinePath, runtimeFilePath);
    await rm(quarantinePath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    await rm(quarantinePath, { force: true });
  }
}

async function writeTemporaryRecord(
  runtimeFilePath: string,
  record: ServerRecord,
): Promise<string> {
  await mkdir(path.dirname(runtimeFilePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${runtimeFilePath}.${record.processFingerprint}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  return temporaryPath;
}

async function readRecordAt(filePath: string): Promise<ServerRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return isServerRecord(parsed) ? parsed : null;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    )
      return null;
    throw error;
  }
}

function normalizeRecord(input: ServerRecordInput): ServerRecord {
  return {
    ...input,
    processFingerprint: input.processFingerprint ?? input.instanceId,
  };
}

function isServerRecord(value: unknown): value is ServerRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.protocolVersion) &&
    typeof record.instanceId === "string" &&
    typeof record.processFingerprint === "string" &&
    typeof record.pid === "number" &&
    Number.isInteger(record.pid) &&
    record.pid > 0 &&
    typeof record.port === "number" &&
    Number.isInteger(record.port) &&
    record.port > 0 &&
    record.port <= 65_535
  );
}
