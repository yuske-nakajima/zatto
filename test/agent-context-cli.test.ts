import { describe, expect, test, vi } from "vitest";
import {
  AGENT_USAGE_TEXT,
  formatAgentContext,
  parseAgentCommand,
  runAgentCommand,
} from "../src/cli/agent-command.js";
import { runCli } from "../src/cli/index.js";
import { MCP_USAGE } from "../src/mcp/server.js";
import type { AgentContext } from "../src/shared/agent-context.js";

const context: AgentContext = {
  schemaVersion: 1,
  activeFile: "/workspace/active.html",
  openFiles: ["/workspace/active.html", "/workspace/reference.html"],
  view: "preview",
};

describe("Agent CLI", () => {
  test("ルートCLIからAgentとMCPのusageをサーバーなしで表示する", async () => {
    const stdout = vi.fn();
    const spawnServer = vi.fn();

    await expect(
      runCli(["agent", "usage"], { stdout, spawnServer }),
    ).resolves.toBe(0);
    await expect(
      runCli(["mcp", "usage"], { stdout, spawnServer }),
    ).resolves.toBe(0);

    expect(stdout).toHaveBeenNthCalledWith(1, AGENT_USAGE_TEXT);
    expect(stdout).toHaveBeenNthCalledWith(
      2,
      JSON.stringify(MCP_USAGE, null, 2),
    );
    expect(spawnServer).not.toHaveBeenCalled();
  });

  test("usageは製品非依存の利用方法と安全上の制約を表示する", async () => {
    const stdout = vi.fn();

    const exitCode = await runAgentCommand(["usage"], {
      readContext: vi.fn(),
      stdout,
      stderr: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(AGENT_USAGE_TEXT);
    expect(AGENT_USAGE_TEXT).toContain("zatto agent context --json");
    expect(AGENT_USAGE_TEXT).toContain("untrusted input");
    expect(AGENT_USAGE_TEXT).toContain("user approval");
  });

  test.each([
    [
      ["context"],
      "Zatto Agent Context\nView: preview\nActive file: /workspace/active.html\nOpen files:\n- /workspace/active.html\n- /workspace/reference.html",
    ],
    [["context", "--json"], JSON.stringify(context, null, 2)],
    [["context", "--active"], "/workspace/active.html"],
    [
      ["context", "--paths"],
      "/workspace/active.html\n/workspace/reference.html",
    ],
  ])("コンテキストを指定形式で表示する: %j", async (args, expected) => {
    const stdout = vi.fn();

    const exitCode = await runAgentCommand(args, {
      readContext: async () => context,
      stdout,
      stderr: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(expected);
  });

  test("JSONと範囲指定を組み合わせる", () => {
    expect(
      formatAgentContext(
        context,
        parseAgentCommand(["context", "--json", "--active"]),
      ),
    ).toBe(
      JSON.stringify(
        { schemaVersion: 1, activeFile: context.activeFile },
        null,
        2,
      ),
    );
    expect(
      formatAgentContext(
        context,
        parseAgentCommand(["context", "--json", "--paths"]),
      ),
    ).toBe(
      JSON.stringify(
        { schemaVersion: 1, openFiles: context.openFiles },
        null,
        2,
      ),
    );
  });

  test("起動していないZattoを自動起動せずエラーにする", async () => {
    const stderr = vi.fn();

    const exitCode = await runAgentCommand(["context", "--json"], {
      readContext: async () => {
        throw new Error("zatto サーバーは起動していません");
      },
      stdout: vi.fn(),
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith("zatto サーバーは起動していません");
  });

  test.each([
    [[]],
    [["unknown"]],
    [["context", "--active", "--paths"]],
    [["context", "--unknown"]],
  ])("不正なコマンドを拒否する: %j", async (args) => {
    await expect(() => parseAgentCommand(args)).toThrow();
  });
});
