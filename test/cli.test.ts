import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("zatto CLI", () => {
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
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ name: "zatto" }))
      .mockResolvedValueOnce(jsonResponse({ added: [] }, 201));
    const spawnServer = vi.fn();
    const openBrowser = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runCli(["a.html", "b.html"], {
      fetch,
      spawnServer,
      openBrowser,
      stdout,
    });

    expect(exitCode).toBe(0);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:6280/api/session/add",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          paths: [path.resolve("a.html"), path.resolve("b.html")],
        }),
      }),
    );
    expect(stdout).toHaveBeenCalledWith("http://127.0.0.1:6280/");
  });

  test("応答がなければ detached サーバーを起動してブラウザを開く", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("接続失敗"))
      .mockResolvedValueOnce(jsonResponse({ name: "zatto" }))
      .mockResolvedValueOnce(jsonResponse({ added: [] }, 201));
    const spawnServer = vi.fn();
    const openBrowser = vi.fn();

    const exitCode = await runCli(["a.html"], {
      fetch,
      spawnServer,
      openBrowser,
      wait: async () => {},
    });

    expect(exitCode).toBe(0);
    expect(spawnServer).toHaveBeenCalledWith(6280);
    expect(openBrowser).toHaveBeenCalledWith("http://127.0.0.1:6280/");
  });

  test("他プロセスが応答するポートを避けて次のポートで起動する", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("other"))
      .mockRejectedValueOnce(new Error("接続失敗"))
      .mockResolvedValueOnce(jsonResponse({ name: "zatto" }))
      .mockResolvedValueOnce(jsonResponse({ added: [] }, 201));
    const spawnServer = vi.fn();
    const openBrowser = vi.fn();

    const exitCode = await runCli(["--no-open", "a.html"], {
      fetch,
      spawnServer,
      openBrowser,
      wait: async () => {},
    });

    expect(exitCode).toBe(0);
    expect(spawnServer).toHaveBeenCalledWith(6281);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  test("10ポートが他プロセスに占有されている場合は起動しない", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("other"));
    const spawnServer = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli(["a.html"], {
      fetch,
      spawnServer,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "6280 から利用可能なポートを 10 件確認しましたが、起動できませんでした",
    );
  });

  test("--stop で既存サーバーを停止する", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ name: "zatto" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 202));
    const stdout = vi.fn();

    const exitCode = await runCli(["--stop"], { fetch, stdout });

    expect(exitCode).toBe(0);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:6280/api/shutdown",
      { method: "POST" },
    );
    expect(stdout).toHaveBeenCalledWith("zatto サーバーを停止しました (6280)");
  });

  test("--stop はサーバー未起動でも正常終了する", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error("接続失敗"));
    const stdout = vi.fn();

    const exitCode = await runCli(["--stop"], { fetch, stdout });

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      "ポート 6280 で zatto サーバーは起動していません",
    );
  });

  test("ファイルなしの通常起動と不正なポートを拒否する", async () => {
    const stderr = vi.fn();

    expect(await runCli([], { stderr })).toBe(1);
    expect(await runCli(["--port", "0", "a.html"], { stderr })).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      "HTML ファイルを1つ以上指定してください",
    );
    expect(stderr).toHaveBeenCalledWith(
      "`--port` には 1〜65535 の整数を指定してください",
    );
  });
});
