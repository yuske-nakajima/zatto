import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageDirectory = await mkdtemp(path.join(os.tmpdir(), "zatto-pack-"));
const consumerDirectory = await mkdtemp(
  path.join(os.tmpdir(), "zatto-consumer-"),
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

try {
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

  const packedPaths = packResult.files.map((file) => file.path);
  const requiredPaths = [
    "LICENSE",
    "README.md",
    "bin/zatto.js",
    "dist/cli/index.js",
    "dist/server/index.js",
    "dist/web/index.html",
    "package.json",
  ];
  for (const requiredPath of requiredPaths) {
    if (!packedPaths.includes(requiredPath)) {
      throw new Error(`npmパッケージに${requiredPath}が含まれていません`);
    }
  }

  const forbiddenPrefixes = ["design/", "docs/", "src/", "test/"];
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

  const installedBin = path.join(
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
  const sessionPath = path.join(consumerDirectory, "session.json");
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
      env: { ...process.env, ZATTO_SESSION_FILE: sessionPath },
      timeout: 15_000,
    },
  );
  serverStarted = true;

  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
  const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
  const session = await readFile(sessionPath, "utf8");
  if (
    !healthResponse.ok ||
    !pageResponse.ok ||
    !session.includes("Package fixture")
  ) {
    throw new Error(
      "インストールしたパッケージからサーバーを起動できませんでした",
    );
  }

  await execFileAsync(installedBin, ["--port", String(port), "--stop"], {
    cwd: consumerDirectory,
    timeout: 10_000,
  });
  serverStarted = false;

  console.log("npm tarballをnpxで実行します");
  const { stdout: npxOutput } = await execFileAsync(
    "npx",
    ["--yes", "--package", tarballPath, "zatto", "--version"],
    { cwd: npxDirectory, env: npmEnvironment, timeout: 120_000 },
  );
  if (!npxOutput.trim()) {
    throw new Error("ローカルtarballをnpxで実行できませんでした");
  }

  console.log(`npmパッケージを検証しました: ${packResult.filename}`);
} finally {
  if (serverStarted) {
    await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(2_000),
    }).catch(() => undefined);
  }
  await rm(packageDirectory, { recursive: true, force: true });
  await rm(consumerDirectory, { recursive: true, force: true });
  await rm(npxDirectory, { recursive: true, force: true });
}
