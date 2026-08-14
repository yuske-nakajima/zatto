import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createServerEnvironment } from "./create-server-environment.mjs";
import { verifyPublicServer } from "./verify-public-server.mjs";

const execFileAsync = promisify(execFile);
const expectedVersion = "0.3.0";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageDirectory = await mkdtemp(path.join(os.tmpdir(), "zatto-pack-"));
const consumerDirectory = await mkdtemp(
  path.join(os.tmpdir(), "zatto consumer #%-"),
);
const npxDirectory = await mkdtemp(path.join(os.tmpdir(), "zatto-npx-"));
const port = 40_000 + Math.floor(Math.random() * 20_000);
const registry = "https://registry.npmjs.org/";
const npmEnvironment = {
  ...process.env,
  NPM_CONFIG_CACHE: path.join(packageDirectory, "npm-cache"),
  NPM_CONFIG_REGISTRY: registry,
};
let serverStarted = false;
let installedBin;
const sessionPath = path.join(consumerDirectory, "session.json");
const runtimePath = path.join(consumerDirectory, "server.json");
let serverEnvironment = process.env;

try {
  serverEnvironment = await createServerEnvironment({
    consumerDirectory,
    runtimePath,
    sessionPath,
  });
  console.log("npm tarballを作成します");
  const { stdout: packOutput } = await execFileAsync(
    "npm",
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      packageDirectory,
    ],
    { cwd: repositoryRoot, env: npmEnvironment, timeout: 30_000 },
  );
  const [packResult] = JSON.parse(packOutput);
  if (!packResult?.filename || !Array.isArray(packResult.files)) {
    throw new Error("npm packの結果を解析できませんでした");
  }
  if (packResult.version !== expectedVersion) {
    throw new Error(`npm tarballのversionが${expectedVersion}ではありません`);
  }

  const packedPaths = packResult.files.map((file) => file.path);
  const requiredPaths = [
    "LICENSE",
    "README.md",
    "README.ja.md",
    "bin/zatto.js",
    "dist/cli/index.js",
    "dist/server/index.d.ts",
    "dist/server/index.js",
    "dist/web/index.html",
    "package.json",
  ];
  for (const requiredPath of requiredPaths) {
    if (!packedPaths.includes(requiredPath)) {
      throw new Error(`npmパッケージに${requiredPath}が含まれていません`);
    }
  }

  const forbiddenPrefixes = ["design/", "docs/", "scripts/", "src/", "test/"];
  const forbiddenPath = packedPaths.find((packedPath) =>
    forbiddenPrefixes.some((prefix) => packedPath.startsWith(prefix)),
  );
  if (forbiddenPath) {
    throw new Error(
      `npmパッケージに公開対象外の${forbiddenPath}が含まれています`,
    );
  }

  const tarballPath = path.join(packageDirectory, packResult.filename);
  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ private: true })}\n`,
    "utf8",
  );
  console.log("npm tarballを別ディレクトリへインストールします");
  await execFileAsync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath],
    { cwd: consumerDirectory, env: npmEnvironment, timeout: 120_000 },
  );

  installedBin = path.join(
    consumerDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "zatto.cmd" : "zatto",
  );
  const { stdout: helpOutput } = await execFileAsync(installedBin, ["--help"], {
    cwd: consumerDirectory,
    timeout: 10_000,
  });
  if (!helpOutput.includes("Usage: zatto")) {
    throw new Error("インストールしたCLIからヘルプを取得できませんでした");
  }

  console.log("インストールしたCLIからサーバーを起動します");
  const fixturePath = path.join(consumerDirectory, "fixture.html");
  await writeFile(
    fixturePath,
    "<!doctype html><title>Package fixture</title><p>zatto</p>\n",
    "utf8",
  );
  await execFileAsync(
    installedBin,
    ["--no-open", "--port", String(port), fixturePath],
    {
      cwd: consumerDirectory,
      env: serverEnvironment,
      timeout: 15_000,
    },
  );
  serverStarted = true;

  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  const healthResponse = await fetch(
    `http://127.0.0.1:${runtime.port}/api/health`,
  );
  const pageResponse = await fetch(`http://127.0.0.1:${runtime.port}/`);
  const health = await healthResponse.json();
  const session = await readFile(sessionPath, "utf8");
  if (
    !healthResponse.ok ||
    health.version !== expectedVersion ||
    !pageResponse.ok ||
    !session.includes("Package fixture")
  ) {
    throw new Error(
      "インストールしたパッケージからサーバーを起動できませんでした",
    );
  }

  await execFileAsync(installedBin, ["--stop"], {
    cwd: consumerDirectory,
    env: serverEnvironment,
    timeout: 10_000,
  });
  serverStarted = false;

  console.log("公開サーバーエントリーを検証します");
  await verifyPublicServer({
    consumerDirectory,
    environment: serverEnvironment,
    expectedVersion,
  });

  console.log("npm tarballをnpxで実行します");
  const { stdout: npxOutput } = await execFileAsync(
    "npx",
    ["--yes", "--package", tarballPath, "zatto", "--version"],
    { cwd: npxDirectory, env: npmEnvironment, timeout: 120_000 },
  );
  if (npxOutput.trim() !== expectedVersion) {
    throw new Error(`CLIのversionが${expectedVersion}ではありません`);
  }

  console.log(`npmパッケージを検証しました: ${packResult.filename}`);
} finally {
  if (serverStarted && installedBin) {
    await execFileAsync(installedBin, ["--stop"], {
      cwd: consumerDirectory,
      env: serverEnvironment,
      timeout: 10_000,
    }).catch(() => undefined);
  }
  await rm(packageDirectory, { recursive: true, force: true });
  await rm(consumerDirectory, { recursive: true, force: true });
  await rm(npxDirectory, { recursive: true, force: true });
}
