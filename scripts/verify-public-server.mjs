import { execFile, spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 50;
const START_TIMEOUT_MS = 10_000;

/**
 * インストール済みパッケージの公開サーバーエントリーを検証する。
 *
 * @param options - consumerディレクトリ、期待version、サーバー環境
 * @returns 検証完了時に解決するPromise
 * @throws 公開サブパス、起動、health、cleanupの契約を満たさない場合
 */
export async function verifyPublicServer(options) {
  const runtimePath = path.join(
    options.consumerDirectory,
    "public-server.json",
  );
  const instanceId = "package-public-server";
  const entryPath = await resolvePublicServerEntry(
    options.consumerDirectory,
    options.expectedVersion,
  );
  const child = spawn(
    process.execPath,
    [
      entryPath,
      "--port",
      "0",
      "--instance-id",
      instanceId,
      "--runtime-file",
      runtimePath,
    ],
    {
      cwd: options.consumerDirectory,
      env: options.environment,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const runtime = await waitForRuntime(runtimePath, child, () => stderr);
    const response = await fetch(
      `http://127.0.0.1:${runtime.port}/api/health`,
      { signal: AbortSignal.timeout(START_TIMEOUT_MS) },
    );
    const health = await response.json();
    if (
      !response.ok ||
      health.name !== "zatto" ||
      health.version !== options.expectedVersion ||
      health.instanceId !== instanceId ||
      health.protocolVersion !== 2
    ) {
      throw new Error("公開サーバーエントリーのhealthが不正です");
    }

    child.kill("SIGTERM");
    const exit = await waitForExit(child);
    if (exit.code !== 0 || exit.signal !== null) {
      throw new Error(
        `公開サーバーが正常終了しませんでした: code=${exit.code}, signal=${exit.signal}`,
      );
    }
    await waitForMissing(runtimePath);
    await waitForMissing(`${runtimePath}.lock`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      try {
        await waitForExit(child);
      } catch {
        child.kill("SIGKILL");
        await waitForExit(child);
      }
    }
  }
}

async function resolvePublicServerEntry(consumerDirectory, expectedVersion) {
  const resolverPath = path.join(consumerDirectory, "resolve-server.mjs");
  await writeFile(
    resolverPath,
    [
      'import { createRequire } from "node:module";',
      'import { startServer } from "@yuske-nakajima/zatto/server";',
      "const require = createRequire(import.meta.url);",
      'const manifest = require("@yuske-nakajima/zatto/package.json");',
      'if (typeof startServer !== "function") throw new Error("startServer export is missing");',
      "process.stdout.write(JSON.stringify({",
      '  importUrl: import.meta.resolve("@yuske-nakajima/zatto/server"),',
      '  requirePath: require.resolve("@yuske-nakajima/zatto/server"),',
      "  version: manifest.version,",
      "  type: manifest.type,",
      "}));",
      "",
    ].join("\n"),
    "utf8",
  );
  const { stdout } = await execFileAsync(process.execPath, [resolverPath], {
    cwd: consumerDirectory,
    timeout: START_TIMEOUT_MS,
  });
  const resolved = JSON.parse(stdout);
  const importPath = fileURLToPath(resolved.importUrl);
  if (
    resolved.requirePath !== importPath ||
    resolved.version !== expectedVersion ||
    resolved.type !== "module"
  ) {
    throw new Error("公開サーバーまたはpackage manifestを解決できませんでした");
  }
  return importPath;
}

async function waitForRuntime(runtimePath, child, stderr) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`公開サーバーが起動前に終了しました: ${stderr()}`);
    }
    try {
      const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
      if (Number.isInteger(runtime.port) && runtime.port > 0) return runtime;
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError))
        throw error;
    }
    await delay();
  }
  throw new Error(
    `公開サーバーのruntime recordを取得できませんでした: ${stderr()}`,
  );
}

async function waitForMissing(targetPath) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await access(targetPath);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    await delay();
  }
  throw new Error(`SIGTERM後も${path.basename(targetPath)}が残っています`);
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (code = child.exitCode, signal = child.signalCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("exit", finish);
      resolve({ code, signal });
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("exit", finish);
      reject(new Error("公開サーバーがSIGTERMで終了しませんでした"));
    }, START_TIMEOUT_MS);
    child.once("exit", finish);
    if (child.exitCode !== null || child.signalCode !== null) finish();
  });
}

function delay() {
  return new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}
