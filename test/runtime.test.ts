import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  acquireServerLock,
  readServerLockState,
  readServerRecord,
  releaseServerRuntime,
  SERVER_PROTOCOL_VERSION,
  updateServerLockState,
  writeServerRecord,
} from "../src/server/runtime.js";
import { writeLockOwner } from "../src/server/runtime-lock-io.js";

describe("server runtime", () => {
  let tempDir: string;
  let runtimeFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-runtime-test-"));
    runtimeFilePath = path.join(tempDir, "runtime", "server.json");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("同じruntime fileでは1プロセスだけがロックを取得する", async () => {
    const first = await acquireServerLock(runtimeFilePath, {
      instanceId: "first",
      pid: process.pid,
    });
    const second = await acquireServerLock(runtimeFilePath, {
      instanceId: "second",
      pid: process.pid,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);

    await releaseServerRuntime(runtimeFilePath, "first");
  });

  test("recordをatomicに保存し、所有者だけが削除する", async () => {
    const lock = await acquireServerLock(runtimeFilePath, {
      instanceId: "owner",
      pid: process.pid,
    });
    expect(lock).toBe(true);

    await writeServerRecord(runtimeFilePath, {
      instanceId: "owner",
      pid: process.pid,
      port: 7123,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });

    await releaseServerRuntime(runtimeFilePath, "other");
    expect(await readServerRecord(runtimeFilePath)).toMatchObject({
      instanceId: "owner",
      port: 7123,
    });
    expect(await readServerLockState(runtimeFilePath)).toMatchObject({
      instanceId: "owner",
    });
    expect(
      (await readdir(path.dirname(runtimeFilePath))).some((name) =>
        name.includes(".release-"),
      ),
    ).toBe(false);

    await releaseServerRuntime(runtimeFilePath, "owner");
    expect(await readServerRecord(runtimeFilePath)).toBeNull();
  });

  test("recordを所有者だけが読める権限で保存する", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "owner",
      pid: process.pid,
      port: 7123,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });

    const mode = (await stat(runtimeFilePath)).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(JSON.parse(await readFile(runtimeFilePath, "utf8"))).toMatchObject({
      instanceId: "owner",
    });
  });

  test("stale lockを同時に回収しても1プロセスだけが取得する", async () => {
    await acquireServerLock(runtimeFilePath, {
      instanceId: "stale",
      pid: 2_147_483_647,
      acquiredAt: 0,
    });

    const [first, second] = await Promise.all([
      acquireServerLock(runtimeFilePath, {
        instanceId: "first",
        pid: process.pid,
      }),
      acquireServerLock(runtimeFilePath, {
        instanceId: "second",
        pid: process.pid,
      }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    await releaseServerRuntime(runtimeFilePath, first ? "first" : "second");
  });

  test("heartbeat期限切れでもowner PIDが生存中ならlockを回収しない", async () => {
    await acquireServerLock(runtimeFilePath, {
      instanceId: "paused",
      pid: process.pid,
      acquiredAt: 0,
    });

    await expect(
      acquireServerLock(runtimeFilePath, {
        instanceId: "duplicate",
        pid: process.pid,
      }),
    ).resolves.toBe(false);
    await releaseServerRuntime(runtimeFilePath, "paused");
  });

  test("owner PIDが終了済みならheartbeat時刻に関係なく回収する", async () => {
    await acquireServerLock(runtimeFilePath, {
      instanceId: "dead",
      pid: 2_147_483_647,
      acquiredAt: Date.now(),
    });

    await expect(
      acquireServerLock(runtimeFilePath, {
        instanceId: "recovered",
        pid: process.pid,
      }),
    ).resolves.toBe(true);
    await releaseServerRuntime(runtimeFilePath, "recovered");
  });

  test("owner不在dirのmtimeが大幅に未来でも回収する", async () => {
    const lockPath = `${runtimeFilePath}.lock`;
    await mkdir(lockPath, { recursive: true });
    const future = new Date(Date.now() + 20_000);
    await utimes(lockPath, future, future);

    await expect(
      acquireServerLock(runtimeFilePath, {
        instanceId: "recovered",
        pid: process.pid,
      }),
    ).resolves.toBe(true);
    await releaseServerRuntime(runtimeFilePath, "recovered");
  });

  test("終了したプロセスが残したreclaim lockを回収する", async () => {
    const lockPath = `${runtimeFilePath}.lock`;
    const reclaimLockPath = `${lockPath}.reclaim`;
    await mkdir(lockPath, { recursive: true });
    await writeFile(
      path.join(lockPath, "owner.json"),
      '{"instanceId":"stale","pid":2147483647,"processFingerprint":"stale","acquiredAt":0}\n',
      "utf8",
    );
    await mkdir(reclaimLockPath);
    await writeFile(
      path.join(reclaimLockPath, "owner.json"),
      '{"instanceId":"stale-reclaimer","pid":2147483647,"processFingerprint":"stale-reclaimer","acquiredAt":0}\n',
      "utf8",
    );

    await expect(
      acquireServerLock(runtimeFilePath, {
        instanceId: "recovered",
        pid: process.pid,
      }),
    ).resolves.toBe(true);

    await releaseServerRuntime(runtimeFilePath, "recovered");
  });

  test("所有権を失ったprocessは新しいlock stateを更新できない", async () => {
    await acquireServerLock(runtimeFilePath, {
      instanceId: "old",
      pid: process.pid,
      processFingerprint: "old-fingerprint",
    });
    await releaseServerRuntime(runtimeFilePath, "old", "old-fingerprint");
    await acquireServerLock(runtimeFilePath, {
      instanceId: "new",
      pid: process.pid,
      processFingerprint: "new-fingerprint",
    });

    await expect(
      updateServerLockState(runtimeFilePath, "old-fingerprint", {
        heartbeatAt: Date.now(),
        port: 9999,
      }),
    ).resolves.toBe(false);
    expect(await readServerLockState(runtimeFilePath)).toMatchObject({
      instanceId: "new",
      processFingerprint: "new-fingerprint",
    });

    await releaseServerRuntime(runtimeFilePath, "new", "new-fingerprint");
  });

  test("lock ownerの書き込みに失敗した場合は空dirを回収する", async () => {
    const lockPath = `${runtimeFilePath}.lock`;
    await mkdir(lockPath, { recursive: true });
    await writeFile(path.join(lockPath, "owner.json"), "occupied", "utf8");

    await expect(
      writeLockOwner(lockPath, {
        instanceId: "owner",
        pid: process.pid,
        processFingerprint: "owner-fingerprint",
        acquiredAt: Date.now(),
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
