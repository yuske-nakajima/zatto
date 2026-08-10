import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli/index.js";
import {
  SERVER_PROTOCOL_VERSION,
  writeServerRecord,
} from "../src/server/runtime.js";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("session exchange CLI", () => {
  let tempDir: string;
  let runtimeFilePath: string;
  let exchangeFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-cli-exchange-"));
    runtimeFilePath = path.join(tempDir, "runtime", "server.json");
    exchangeFilePath = path.join(tempDir, "saved-session.json");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("importとexportのファイルパスを絶対パスへ正規化する", () => {
    expect(parseCliArgs(["--import", "session.json"])).toMatchObject({
      importFile: path.resolve("session.json"),
      exportFile: null,
    });
    expect(parseCliArgs(["--export", "session.json"])).toMatchObject({
      importFile: null,
      exportFile: path.resolve("session.json"),
    });
  });

  test.each([
    [["--import", "session.json", "page.html"]],
    [["--export", "session.json", "page.html"]],
    [["--import", "in.json", "--export", "out.json"]],
    [["--stop", "--import", "session.json"]],
    [["--stop", "page.html"]],
  ])("セッション操作とほかの操作の併用を拒否する", (args) => {
    expect(() => parseCliArgs(args)).toThrow(
      "`--import`、`--export`、`--stop`、HTML ファイルは同時に指定できません",
    );
  });

  test.each(["--import=", "--export="])(
    "%sの空ファイル名を拒否する",
    (option) => {
      expect(() => parseCliArgs([option])).toThrow(
        "セッションファイルには空でないパスを指定してください",
      );
    },
  );

  test("セッションファイルを検証してからidentity付きでインポートする", async () => {
    const exchange = {
      format: "zatto-session",
      version: 1,
      entries: [{ path: "/work/first.html" }],
    };
    await writeFile(exchangeFilePath, JSON.stringify(exchange), "utf8");
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
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));
    const openBrowser = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runCli(["--import", exchangeFilePath], {
      fetch,
      openBrowser,
      stdout,
      runtimeFilePath,
    });

    expect(exitCode).toBe(0);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:7010/api/session",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-zatto-instance-id": "running-instance",
        },
        body: JSON.stringify(exchange),
      },
    );
    expect(openBrowser).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(
      `セッションをインポートしました: ${exchangeFilePath}`,
    );
  });

  test("不正なJSONではサーバーへ接続せず既存状態を変更しない", async () => {
    await writeFile(exchangeFilePath, "{broken", "utf8");
    const fetch = vi.fn<typeof globalThis.fetch>();
    const spawnServer = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli(["--import", exchangeFilePath], {
      fetch,
      spawnServer,
      stderr,
      runtimeFilePath,
    });

    expect(exitCode).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(spawnServer).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      `セッションファイルの JSON が不正です: ${exchangeFilePath}`,
    );
  });

  test("稼働中セッションを指定ファイルへエクスポートする", async () => {
    const exchange = {
      format: "zatto-session",
      version: 1,
      entries: [{ path: "/work/first.html" }],
    };
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
      .mockResolvedValueOnce(jsonResponse(exchange));
    const openBrowser = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runCli(["--export", exchangeFilePath], {
      fetch,
      openBrowser,
      stdout,
      runtimeFilePath,
    });

    expect(exitCode).toBe(0);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:7010/api/session/export",
    );
    expect(JSON.parse(await readFile(exchangeFilePath, "utf8"))).toEqual(
      exchange,
    );
    expect(openBrowser).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(
      `セッションをエクスポートしました: ${exchangeFilePath}`,
    );
  });
});
