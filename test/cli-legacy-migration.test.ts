import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runCli } from "../src/cli/index.js";
import {
  acquireServerLock,
  readServerLockState,
  releaseServerRuntime,
  updateServerLockState,
  writeServerRecord,
} from "../src/server/runtime.js";

let dir: string;
let runtimeFilePath: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-legacy-"));
  runtimeFilePath = path.join(dir, "server.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const old = {
  instanceId: "legacy",
  processFingerprint: "legacy-process",
  pid: process.pid,
  port: 7345,
  protocolVersion: 2,
};

test.each(["page.html", "--stop"])(
  "preserves a live legacy runtime when health cannot be reached: %j",
  async (args) => {
    await writeServerRecord(runtimeFilePath, old);
    const before = await readFile(runtimeFilePath, "utf8");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("unreachable");
    });
    const spawnServer = vi.fn(),
      stderr = vi.fn();
    expect(
      await runCli([args], { fetch, spawnServer, stderr, runtimeFilePath }),
    ).toBe(1);
    expect(spawnServer).not.toHaveBeenCalled();
    expect(await readFile(runtimeFilePath, "utf8")).toBe(before);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("@1.2.0 --port 7345 --stop"),
    );
  },
);

test("diagnoses old HTTP health without sending registration or shutdown writes", async () => {
  await writeServerRecord(runtimeFilePath, old);
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
    String(input).endsWith("/rpc")
      ? new Response(null, { status: 404 })
      : Response.json({
          name: "zatto",
          version: "1.2.0",
          instanceId: old.instanceId,
          protocolVersion: 2,
        }),
  );
  const spawnServer = vi.fn(),
    stderr = vi.fn();
  expect(
    await runCli(["page.html"], {
      fetch,
      spawnServer,
      stderr,
      runtimeFilePath,
    }),
  ).toBe(1);
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    "http://127.0.0.1:7345/rpc",
    "http://127.0.0.1:7345/api/health",
  ]);
  expect(fetch.mock.calls[1][1]?.method).toBeUndefined();
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).method).toBe(
    "server.health",
  );
  expect(spawnServer).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(runtimeFilePath, "utf8"))).toMatchObject(
    old,
  );
});

test("keeps a live legacy lock without publishing a replacement runtime record", async () => {
  await acquireServerLock(runtimeFilePath, {
    instanceId: old.instanceId,
    processFingerprint: old.processFingerprint,
    pid: process.pid,
  });
  await updateServerLockState(runtimeFilePath, old.processFingerprint, old);
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    throw new Error("unreachable");
  });
  const spawnServer = vi.fn();
  expect(
    await runCli(["page.html"], {
      fetch,
      spawnServer,
      stderr: vi.fn(),
      runtimeFilePath,
    }),
  ).toBe(1);
  expect(spawnServer).not.toHaveBeenCalled();
  await expect(readFile(runtimeFilePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readServerLockState(runtimeFilePath)).toMatchObject(old);
  await releaseServerRuntime(
    runtimeFilePath,
    old.instanceId,
    old.processFingerprint,
  );
});

test("includes the detected custom port in the legacy stop instructions without a runtime record", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.port !== "9000") throw new Error("unused port");
    return url.pathname === "/rpc"
      ? new Response(null, { status: 404 })
      : Response.json({ name: "zatto", version: "1.2.0" });
  });
  const stderr = vi.fn(),
    spawnServer = vi.fn();
  expect(
    await runCli(["--port", "9000", "page.html"], {
      fetch,
      stderr,
      spawnServer,
      runtimeFilePath,
    }),
  ).toBe(1);
  expect(stderr).toHaveBeenCalledWith(
    expect.stringContaining(
      "npx --yes @yuske-nakajima/zatto@1.2.0 --port 9000 --stop",
    ),
  );
  expect(spawnServer).not.toHaveBeenCalled();
  await expect(readFile(runtimeFilePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
});
