import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runCli } from "../src/cli/index.js";
import { startServer } from "../src/server/index.js";
import {
  acquireServerLock,
  readServerRecord,
  releaseServerRuntime,
  type ServerRecord,
} from "../src/server/runtime.js";

describe("managed zatto server", () => {
  let tempDir: string;
  let runtimeFilePath: string;
  let sessionFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "zatto-managed-server-test-"),
    );
    runtimeFilePath = path.join(tempDir, "runtime", "server.json");
    sessionFilePath = path.join(tempDir, "config", "session.json");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("希望portが占有中ならOS割当portで起動してrecordへ保存する", async () => {
    const occupiedServer = createServer();
    await new Promise<void>((resolve) => {
      occupiedServer.listen(0, "127.0.0.1", resolve);
    });
    const address = occupiedServer.address();
    if (!address || typeof address === "string") {
      throw new Error("テスト用ポートを取得できませんでした");
    }

    const server = await startServer(address.port, {
      instanceId: "managed-instance",
      runtimeFilePath,
      sessionFilePath,
    });

    expect(server).not.toBeNull();
    expect(server?.port).not.toBe(address.port);
    expect(await readServerRecord(runtimeFilePath)).toMatchObject({
      instanceId: "managed-instance",
      port: server?.port,
    });

    await rm(runtimeFilePath);
    const fixturePath = path.join(tempDir, "recovered.html");
    await writeFile(fixturePath, "<title>Recovered</title>", "utf8");
    const spawnServer = vi.fn();
    await expect(
      runCli(["--no-open", fixturePath], {
        fetch,
        runtimeFilePath,
        spawnServer,
      }),
    ).resolves.toBe(0);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(await readServerRecord(runtimeFilePath)).toMatchObject({
      instanceId: "managed-instance",
      port: server?.port,
    });

    const duplicate = await startServer(0, {
      instanceId: "duplicate-instance",
      runtimeFilePath,
      sessionFilePath,
    });
    expect(duplicate).toBeNull();

    await server?.app.close();
    await new Promise<void>((resolve, reject) => {
      occupiedServer.close((error) => (error ? reject(error) : resolve()));
    });
    expect(await readServerRecord(runtimeFilePath)).toBeNull();
  });

  test("--stop完了直後に同じruntimeで再起動できる", async () => {
    const exit = vi.fn();
    const server = await startServer(0, {
      instanceId: "stopping-instance",
      runtimeFilePath,
      sessionFilePath,
      exit,
    });
    expect(server).not.toBeNull();

    await expect(
      runCli(["--stop"], {
        fetch,
        runtimeFilePath,
        wait: (milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds)),
      }),
    ).resolves.toBe(0);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    const restarted = await startServer(0, {
      instanceId: "restarted-instance",
      runtimeFilePath,
      sessionFilePath,
      exit: vi.fn(),
    });
    expect(restarted).not.toBeNull();
    await restarted?.app.close();
  });

  test("record保存に失敗した場合はlistenとlockを解放する", async () => {
    let attemptedRecord: ServerRecord | undefined;

    await expect(
      startServer(0, {
        instanceId: "write-failure",
        runtimeFilePath,
        sessionFilePath,
        writeRuntimeRecord: async (_runtimeFilePath, record) => {
          attemptedRecord = record;
          throw new Error("record write failed");
        },
      }),
    ).rejects.toThrow("record write failed");

    expect(attemptedRecord).toBeDefined();
    await expect(
      fetch(`http://127.0.0.1:${attemptedRecord?.port}/api/health`),
    ).rejects.toThrow();
    expect(
      await acquireServerLock(runtimeFilePath, {
        instanceId: "next-instance",
        pid: process.pid,
      }),
    ).toBe(true);
    await releaseServerRuntime(runtimeFilePath, "next-instance");
  });
});
