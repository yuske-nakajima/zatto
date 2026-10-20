import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli/index.js";
import {
  acquireServerLock,
  PREVIOUS_PROTOCOL_VERSION,
  releaseServerRuntime,
  SERVER_PROTOCOL_VERSION,
  writeServerRecord,
} from "../src/server/runtime.js";
import { rpcFixture, rpcRequest } from "./rpc-client-fixture.js";

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
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            name: "zatto",
            version: "2.0.0",
            instanceId: "running-instance",
            protocolVersion: SERVER_PROTOCOL_VERSION,
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            activeWorkspaceId: "default",
            workspaces: [{ id: "default", name: "Default" }],
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse(
            {
              added: [],
              resolved: [],
              workspaceId: "default",
              activeWorkspaceId: "default",
              session: { entries: [] },
            },
            201,
          ),
        ),
      );
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
      3,
      "http://127.0.0.1:7010/rpc",
      rpcRequest("session.add", {
        paths: [path.resolve("a.html"), path.resolve("b.html")],
        workspaceId: "default",
      }),
    );
    expect(stdout).toHaveBeenCalledWith("http://127.0.0.1:7010/");
  });

  test("recordがなければdetachedサーバーを起動して記録されたポートへ合流する", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (let index = 0; index < 20; index += 1) {
      fetch.mockRejectedValueOnce(new Error("接続失敗"));
    }
    fetch
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            name: "zatto",
            version: "2.0.0",
            instanceId: "requested-instance",
            protocolVersion: SERVER_PROTOCOL_VERSION,
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            activeWorkspaceId: "default",
            workspaces: [{ id: "default", name: "Default" }],
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse(
            {
              added: [],
              resolved: [],
              workspaceId: "default",
              activeWorkspaceId: "default",
              session: { entries: [] },
            },
            201,
          ),
        ),
      );
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
      undefined,
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
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            name: "zatto",
            version: "2.0.0",
            instanceId: "running-instance",
            protocolVersion: SERVER_PROTOCOL_VERSION,
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            activeWorkspaceId: "default",
            workspaces: [{ id: "default", name: "Default" }],
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse(
            {
              added: [],
              resolved: [],
              workspaceId: "default",
              activeWorkspaceId: "default",
              session: { entries: [] },
            },
            201,
          ),
        ),
      );
    const spawnServer = vi.fn();

    const exitCode = await runCli(["--port", "9000", "a.html"], {
      fetch,
      spawnServer,
      runtimeFilePath,
    });

    expect(exitCode).toBe(0);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:7010/rpc",
      rpcRequest("session.add", {}),
    );
  });

  test("recordとserverのprotocolが互換でなければ合流しない", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "incompatible-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: 99,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(
      rpcFixture(async () =>
        jsonResponse({
          name: "zatto",
          version: "2.0.0",
          instanceId: "incompatible-instance",
          protocolVersion: 99,
        }),
      ),
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
      expect.stringContaining("旧 zatto サーバー"),
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
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).endsWith("/rpc")
        ? new Response(null, { status: 404 })
        : jsonResponse({ name: "zatto", version: "1.2.0" }),
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
      expect.stringContaining("@1.2.0 --port 6280 --stop"),
    );
  });

  test("--port指定時も既定範囲の旧serverを検出する", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.port !== "6281") throw new Error("unused port");
      return url.pathname === "/rpc"
        ? new Response(null, { status: 404 })
        : jsonResponse({ name: "zatto", version: "1.2.0" });
    });
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
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("6281"));
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
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            name: "zatto",
            version: "2.0.0",
            instanceId: "running-instance",
            protocolVersion: SERVER_PROTOCOL_VERSION,
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () => jsonResponse({ ok: true }, 202)),
      )
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
      "http://127.0.0.1:7010/rpc",
      rpcRequest("server.shutdown", { instanceId: "running-instance" }),
    );
    expect(stdout).toHaveBeenCalledWith("zatto サーバーを停止しました (7010)");
  });

  test("前版のserverへは操作を送らず、新版CLIでの停止を案内する", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "previous-instance",
      pid: process.pid,
      port: 7011,
      protocolVersion: PREVIOUS_PROTOCOL_VERSION,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(
      rpcFixture(async () =>
        jsonResponse({
          name: "zatto",
          version: "2.1.0",
          instanceId: "previous-instance",
          protocolVersion: PREVIOUS_PROTOCOL_VERSION,
        }),
      ),
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
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("zatto --port 7011 --stop"),
    );
  });

  test("--stopで前版のserverを停止する", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "previous-instance",
      pid: process.pid,
      port: 7011,
      protocolVersion: PREVIOUS_PROTOCOL_VERSION,
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(
        rpcFixture(async () =>
          jsonResponse({
            name: "zatto",
            version: "2.1.0",
            instanceId: "previous-instance",
            protocolVersion: PREVIOUS_PROTOCOL_VERSION,
          }),
        ),
      )
      .mockImplementationOnce(
        rpcFixture(async () => jsonResponse({ ok: true }, 202)),
      )
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
      "http://127.0.0.1:7011/rpc",
      rpcRequest("server.shutdown", { instanceId: "previous-instance" }),
    );
    expect(stdout).toHaveBeenCalledWith("zatto サーバーを停止しました (7011)");
  });

  test("--stopは旧serverを停止せず更新案内を返す", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).endsWith("/rpc")
        ? new Response(null, { status: 404 })
        : jsonResponse({ name: "zatto", version: "1.2.0" }),
    );
    const stderr = vi.fn();
    expect(await runCli(["--stop"], { fetch, stderr, runtimeFilePath })).toBe(
      1,
    );
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("@1.2.0 --port 6280 --stop"),
    );
    expect(
      fetch.mock.calls.every(([input, init]) =>
        String(input).endsWith("/api/health")
          ? !init?.method
          : JSON.parse(String(init?.body)).method === "server.health",
      ),
    ).toBe(true);
  });

  test("--stopは異なるprotocolの同じinstanceを停止しない", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "incompatible-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });
    const fetch = vi.fn<typeof globalThis.fetch>(
      rpcFixture(async () =>
        jsonResponse({
          name: "zatto",
          version: "2.0.0",
          instanceId: "incompatible-instance",
          protocolVersion: 99,
        }),
      ),
    );
    expect(
      await runCli(["--stop"], { fetch, runtimeFilePath, stderr: vi.fn() }),
    ).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("ファイルなしで既存サーバーのビューアーを開く", async () => {
    await writeServerRecord(runtimeFilePath, {
      instanceId: "running-instance",
      pid: process.pid,
      port: 7010,
      protocolVersion: SERVER_PROTOCOL_VERSION,
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(
      rpcFixture(async () =>
        jsonResponse({
          name: "zatto",
          version: "2.0.0",
          instanceId: "running-instance",
          protocolVersion: SERVER_PROTOCOL_VERSION,
        }),
      ),
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
