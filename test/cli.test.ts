import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli/index.js";
import {
  acquireServerLock,
  releaseServerRuntime,
  SERVER_PROTOCOL_VERSION,
  writeServerRecord,
} from "../src/server/runtime.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("zatto CLI", () => {
  let tempDir: string;
  let runtimeFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-cli-test-"));
    runtimeFilePath = path.join(tempDir, "runtime", "server.json");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("引数を解釈し、ファイルパスを絶対パスへ正規化する", () => {
    const options = parseCliArgs(["--port", "7000", "--no-open", "a.html"]);

    expect(options).toMatchObject({
      files: [path.resolve("a.html")],
      port: 7000,
      open: false,
      stop: false,
    });
  });

  test("既存の zatto サーバーへファイルを追加する", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "running-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          name: "zatto",
          instanceId: "running-instance",
          protocolVersion: SERVER_PROTOCOL_VERSION,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ added: [] }, 201));
    const spawnServer = vi.fn();
    const openBrowser = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runCli(["a.html", "b.html"], {
      fetch,
      spawnServer,
      openBrowser,
      stdout,
      runtimeFilePath,
    });

    expect(exitCode).toBe(0);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:7010/api/session/add",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          paths: [path.resolve("a.html"), path.resolve("b.html")],
        }),
      }),
    );
    expect(stdout).toHaveBeenCalledWith("http://127.0.0.1:7010/");
  });

  test("recordがなければdetachedサーバーを起動して記録されたポートへ合流する", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (let index = 0; index < 10; index += 1) {
      fetch.mockRejectedValueOnce(new Error("接続失敗"));
    }
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          name: "zatto",
          instanceId: "requested-instance",
          protocolVersion: SERVER_PROTOCOL_VERSION,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ added: [] }, 201));
    const spawnServer = vi.fn(async (_port, instanceId) => {
      await writeServerRecord(runtimeFilePath, {
        instanceId,
        pid: process.pid,
        port: 7345,
        protocolVersion: SERVER_PROTOCOL_VERSION,
      });
    });
    const openBrowser = vi.fn();

    const exitCode = await runCli(["a.html"], {
      fetch,
      spawnServer,
      openBrowser,
      wait: async () => {},
      runtimeFilePath,
      createInstanceId: () => "requested-instance",
    });

    expect(exitCode).toBe(0);
    expect(spawnServer).toHaveBeenCalledWith(
      6280,
      "requested-instance",
      runtimeFilePath,
    );
    expect(openBrowser).toHaveBeenCalledWith("http://127.0.0.1:7345/");
  });

  test("稼働中サーバーがあれば指定portに関係なく合流する", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "running-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          name: "zatto",
          instanceId: "running-instance",
          protocolVersion: SERVER_PROTOCOL_VERSION,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ added: [] }, 201));
    const spawnServer = vi.fn();

    const exitCode = await runCli(["--port", "9000", "a.html"], {
      fetch,
      spawnServer,
      runtimeFilePath,
    });

    expect(exitCode).toBe(0);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:7010/api/session/add",
      expect.anything(),
    );
  });

  test("recordとserverのprotocolが互換でなければ合流しない", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "incompatible-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: 99,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      jsonResponse({
        name: "zatto",
        instanceId: "incompatible-instance",
        protocolVersion: 99,
      }),
    );
    const spawnServer = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli(["a.html"], {
      fetch,
      spawnServer,
      stderr,
      runtimeFilePath,
    });

    expect(exitCode).toBe(1);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "記録された zatto サーバーと互換性を確認できませんでした (7010)",
    );
  });

  test("応答しないlive PIDのlockがあれば新serverを起動しない", async () => {
    await acquireServerLock(runtimeFilePath, {
      instanceId: "paused-instance",
      pid: process.pid,
      acquiredAt: 0,
    });
    let now = 0;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);
    const spawnServer = vi.fn();
    const stderr = vi.fn();

    try {
      const exitCode = await runCli(["a.html"], {
        fetch: vi.fn<typeof globalThis.fetch>(),
        spawnServer,
        stderr,
        runtimeFilePath,
        wait: async (milliseconds) => {
          now += milliseconds;
        },
      });

      expect(exitCode).toBe(1);
      expect(spawnServer).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledWith(
        `既存の zatto サーバーが応答しません (PID ${process.pid})。プロセスを停止してから再実行してください`,
      );
    } finally {
      dateNow.mockRestore();
      await releaseServerRuntime(runtimeFilePath, "paused-instance");
    }
  });

  test("既定portで旧serverを検出した場合は重複起動しない", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ name: "zatto", version: "0.1.0" }));
    const spawnServer = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli(["a.html"], {
      fetch,
      spawnServer,
      stderr,
      runtimeFilePath,
    });

    expect(exitCode).toBe(1);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "runtime recordのない zatto サーバーがポート 6280 で起動しています。`zatto --stop` で停止してから再実行してください",
    );
  });

  test("--port指定時も既定範囲の旧serverを検出する", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("9000は未使用"))
      .mockRejectedValueOnce(new Error("6280は未使用"))
      .mockResolvedValueOnce(jsonResponse({ name: "zatto", version: "0.1.0" }));
    const spawnServer = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli(["--port", "9000", "a.html"], {
      fetch,
      spawnServer,
      stderr,
      runtimeFilePath,
    });

    expect(exitCode).toBe(1);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "runtime recordのない zatto サーバーがポート 6281 で起動しています。`zatto --stop` で停止してから再実行してください",
    );
  });

  test("--stopでrecordに記録されたサーバーを停止する", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "running-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          name: "zatto",
          instanceId: "running-instance",
          protocolVersion: SERVER_PROTOCOL_VERSION,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 202))
      .mockRejectedValueOnce(new Error("停止済み"));
    const stdout = vi.fn();

    const exitCode = await runCli(["--port", "9000", "--stop"], {
      fetch,
      stdout,
      runtimeFilePath,
    });

    expect(exitCode).toBe(0);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:7010/api/shutdown",
      {
        method: "POST",
        headers: { "x-zatto-instance-id": "running-instance" },
      },
    );
    expect(stdout).toHaveBeenCalledWith("zatto サーバーを停止しました (7010)");
  });

  test("--stopはrecordがない場合に旧serverも停止できる", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ name: "zatto", version: "0.1.0" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 202))
      .mockRejectedValueOnce(new Error("停止済み"));
    const stdout = vi.fn();

    const exitCode = await runCli(["--stop"], {
      fetch,
      stdout,
      runtimeFilePath,
    });

    expect(exitCode).toBe(0);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:6280/api/shutdown",
      { method: "POST" },
    );
  });

  test("--stopは同じinstanceの異なるprotocolも停止する", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "incompatible-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          name: "zatto",
          instanceId: "incompatible-instance",
          protocolVersion: 99,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 202))
      .mockRejectedValueOnce(new Error("停止済み"));

    await expect(runCli(["--stop"], { fetch, runtimeFilePath })).resolves.toBe(
      0,
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:7010/api/shutdown",
      {
        method: "POST",
        headers: { "x-zatto-instance-id": "incompatible-instance" },
      },
    );
  });

  test("ファイルなしで既存サーバーのビューアーを開く", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "running-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      jsonResponse({
        name: "zatto",
        instanceId: "running-instance",
        protocolVersion: SERVER_PROTOCOL_VERSION,
      }),
    );
    const openBrowser = vi.fn();
    const stdout = vi.fn();

    expect(
      await runCli([], {
        fetch,
        openBrowser,
        stdout,
        runtimeFilePath,
      }),
    ).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(openBrowser).toHaveBeenCalledWith("http://127.0.0.1:7010/");
    expect(stdout).toHaveBeenCalledWith("http://127.0.0.1:7010/");
  });

  test("不正なポートを拒否する", async () => {
    const stderr = vi.fn();

    expect(await runCli(["--port", "0", "a.html"], { stderr })).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      "`--port` には 1〜65535 の整数を指定してください",
    );
  });
});
