import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli/index.js";
import {
  SERVER_PROTOCOL_VERSION,
  writeServerRecord,
} from "../src/server/runtime.js";
import { rpcFixture } from "./rpc-client-fixture.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-cli-urls-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
async function invoke(body: unknown, files: string[]) {
  const runtimeFilePath = path.join(dir, "server.json");
  await writeServerRecord(runtimeFilePath, {
    instanceId: "running",
    pid: process.pid,
    port: 7345,
    protocolVersion: SERVER_PROTOCOL_VERSION,
  });
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce(
      rpcFixture(async () =>
        Response.json({
          name: "zatto",
          version: "2.0.0",
          instanceId: "running",
          protocolVersion: SERVER_PROTOCOL_VERSION,
        }),
      ),
    )
    .mockImplementationOnce(
      rpcFixture(async () =>
        Response.json(
          {
            workspaceId: "default",
            activeWorkspaceId: "default",
            session: { entries: [] },
            ...(body as object),
          },
          { status: 201 },
        ),
      ),
    );
  const stdout = vi.fn(),
    stderr = vi.fn(),
    openBrowser = vi.fn();
  const code = await runCli(files, {
    runtimeFilePath,
    fetch,
    stdout,
    stderr,
    openBrowser,
  });
  return { code, stdout, stderr, openBrowser };
}
const entry = (id: string, title: string, filename: string) => ({
  id,
  title,
  absPath: path.resolve(filename),
  addedAt: 1,
});
test("prints the top URL followed by ordered, unique title/direct URL pairs using the connected port", async () => {
  const first = entry("one", "First", "a.html"),
    second = entry("two", "Second", "b.html");
  const result = await invoke(
    { added: [second], resolved: [first, second], workspaceId: "default" },
    ["a.html", "b.html", "a.html"],
  );
  expect(result.code).toBe(0);
  expect(result.stdout.mock.calls.flat().join("\n")).toBe(
    "http://127.0.0.1:7345/\n\nFirst\nhttp://127.0.0.1:7345/?entry=one\n\nSecond\nhttp://127.0.0.1:7345/?entry=two",
  );
  expect(result.stderr).not.toHaveBeenCalled();
  expect(result.openBrowser).not.toHaveBeenCalled();
});
test("rejects a session-only response instead of applying a legacy fallback", async () => {
  const result = await invoke(
    {
      added: [],
      session: { entries: [entry("existing", "Existing", "a.html")] },
    },
    ["a.html"],
  );
  expect(result.code).toBe(1);
  expect(result.stdout).not.toHaveBeenCalled();
  expect(result.stderr).toHaveBeenCalledWith(
    expect.stringContaining("Invalid JSON-RPC response"),
  );
});
test("reports skipped paths to stderr while retaining the successful-add exit contract", async () => {
  const result = await invoke(
    { added: [], resolved: [entry("one", "One", "a.html")] },
    ["missing.html", "a.html"],
  );
  expect(result.code).toBe(0);
  expect(result.stderr).toHaveBeenCalledWith(
    expect.stringContaining(path.resolve("missing.html")),
  );
  expect(result.stdout.mock.calls.flat().join("\n")).toContain("?entry=one");
});
test("keeps full titles on one safe terminal line and URL-encodes entry IDs", async () => {
  const title = `Title\n\r\t\u001b[31m\u0007\u0085\u2028\u202e${"長".repeat(500)}`;
  const result = await invoke(
    {
      added: [entry("id /?", title, "a.html")],
      resolved: [entry("id /?", title, "a.html")],
    },
    ["a.html"],
  );
  const output = result.stdout.mock.calls.flat().join("\n");
  expect(output).toContain("長".repeat(500));
  expect(output.split("\n")).toHaveLength(4);
  expect(output.replaceAll("\n", "")).not.toMatch(
    /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u,
  );
  expect(output).toContain("?entry=id+%2F%3F");
});
test("rejects an empty positional path instead of resolving it to the working directory", () => {
  expect(() => parseCliArgs([""])).toThrow();
});
test("warns when the active workspace changes after registration", async () => {
  const result = await invoke(
    {
      added: [],
      resolved: [entry("one", "One", "a.html")],
      workspaceId: "default",
      activeWorkspaceId: "other",
    },
    ["a.html"],
  );
  expect(result.stderr).toHaveBeenCalledWith(
    expect.stringContaining("default"),
  );
  expect(result.stdout.mock.calls.flat().join("\n")).toContain("?entry=one");
});
test("resolves the captured workspace result when the active snapshot has another ID", async () => {
  const registered = entry("registered-in-a", "Registered", "a.html");
  const result = await invoke(
    {
      added: [registered],
      resolved: [registered],
      session: {
        entries: [entry("same-path-in-b", "Other workspace", "a.html")],
      },
    },
    ["a.html"],
  );
  const output = result.stdout.mock.calls.flat().join("\n");
  expect(output).toContain("?entry=registered-in-a");
  expect(output).not.toContain("same-path-in-b");
});
test("uses the file path when a title contains only terminal control characters", async () => {
  const result = await invoke(
    {
      added: [entry("one", "\u001b\u202e", "a.html")],
      resolved: [entry("one", "\u001b\u202e", "a.html")],
    },
    ["a.html"],
  );
  expect(result.stdout.mock.calls.flat().join("\n")).toContain(
    `${path.resolve("a.html")}\nhttp://127.0.0.1:7345/?entry=one`,
  );
});
