import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APP_NAME, APP_VERSION } from "../meta.js";
import { DEFAULT_PORT } from "../server/index.js";

const MAX_PORT_ATTEMPTS = 10;
const HEALTH_TIMEOUT_MS = 750;
const STARTUP_TIMEOUT_MS = 5_000;
const STARTUP_POLL_INTERVAL_MS = 100;

type HealthStatus = "zatto" | "occupied" | "unreachable";

type CliOptions = {
  files: string[];
  port: number;
  open: boolean;
  stop: boolean;
  help: boolean;
  version: boolean;
};

type CliDependencies = {
  fetch: typeof globalThis.fetch;
  spawnServer: (port: number) => void;
  openBrowser: (url: string) => void;
  wait: (milliseconds: number) => Promise<void>;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const defaultDependencies: CliDependencies = {
  fetch: globalThis.fetch,
  spawnServer: spawnDetachedServer,
  openBrowser,
  wait: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export const HELP_TEXT = `Usage: zatto [options] <file...>

ローカル HTML ファイルを zatto セッションへ追加します。

Options:
  --port <n>    サーバーポート (default: ${DEFAULT_PORT})
  --no-open     ブラウザを自動で開かない
  --stop        常駐サーバーを停止する
  -h, --help    ヘルプを表示する
  -v, --version バージョンを表示する`;

export function parseCliArgs(args: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
      open: { type: "boolean", default: true },
      stop: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
    allowNegative: true,
    strict: true,
  });

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("`--port` には 1〜65535 の整数を指定してください");
  }

  return {
    files: positionals.map((file) => path.resolve(file)),
    port,
    open: values.open ?? true,
    stop: values.stop ?? false,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}

export async function runCli(
  args: string[],
  overrides: Partial<CliDependencies> = {},
): Promise<number> {
  const dependencies = { ...defaultDependencies, ...overrides };
  let options: CliOptions;

  try {
    options = parseCliArgs(args);
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error));
    dependencies.stderr("詳しくは `zatto --help` を確認してください");
    return 1;
  }

  if (options.help) {
    dependencies.stdout(HELP_TEXT);
    return 0;
  }
  if (options.version) {
    dependencies.stdout(APP_VERSION);
    return 0;
  }
  if (options.stop) {
    return stopServer(options.port, dependencies);
  }
  if (options.files.length === 0) {
    dependencies.stderr("HTML ファイルを1つ以上指定してください");
    return 1;
  }

  try {
    const target = await findServer(options.port, dependencies.fetch);
    if (!target.running) {
      dependencies.spawnServer(target.port);
      await waitForServer(target.port, dependencies);
    }

    const url = serverUrl(target.port);
    await addFiles(url, options.files, dependencies.fetch);
    dependencies.stdout(url);

    if (!target.running && options.open) {
      dependencies.openBrowser(url);
    }
    return 0;
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function main(args: string[]): Promise<number> {
  return runCli(args);
}

async function findServer(
  initialPort: number,
  fetchFn: typeof globalThis.fetch,
): Promise<{ port: number; running: boolean }> {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = initialPort + offset;
    if (port > 65_535) {
      break;
    }

    const status = await probeHealth(port, fetchFn);
    if (status === "zatto") {
      return { port, running: true };
    }
    if (status === "unreachable") {
      return { port, running: false };
    }
  }

  throw new Error(
    `${initialPort} から利用可能なポートを ${MAX_PORT_ATTEMPTS} 件確認しましたが、起動できませんでした`,
  );
}

async function probeHealth(
  port: number,
  fetchFn: typeof globalThis.fetch,
): Promise<HealthStatus> {
  let response: Response;
  try {
    response = await fetchFn(`${serverUrl(port)}api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
  } catch {
    return "unreachable";
  }

  if (!response.ok) {
    return "occupied";
  }

  try {
    const body = (await response.json()) as { name?: unknown };
    return body.name === APP_NAME ? "zatto" : "occupied";
  } catch {
    return "occupied";
  }
}

async function waitForServer(
  port: number,
  dependencies: CliDependencies,
): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await probeHealth(port, dependencies.fetch)) === "zatto") {
      return;
    }
    await dependencies.wait(STARTUP_POLL_INTERVAL_MS);
  }
  throw new Error(`zatto サーバーの起動がタイムアウトしました (${port})`);
}

async function addFiles(
  url: string,
  files: string[],
  fetchFn: typeof globalThis.fetch,
): Promise<void> {
  const response = await fetchFn(`${url}api/session/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paths: files }),
  });
  if (!response.ok) {
    throw new Error(`ファイルの追加に失敗しました (HTTP ${response.status})`);
  }
}

async function stopServer(
  port: number,
  dependencies: CliDependencies,
): Promise<number> {
  if ((await probeHealth(port, dependencies.fetch)) !== "zatto") {
    dependencies.stdout(`ポート ${port} で zatto サーバーは起動していません`);
    return 0;
  }

  try {
    const response = await dependencies.fetch(
      `${serverUrl(port)}api/shutdown`,
      { method: "POST" },
    );
    if (!response.ok) {
      throw new Error(`サーバーの停止に失敗しました (HTTP ${response.status})`);
    }
    dependencies.stdout(`zatto サーバーを停止しました (${port})`);
    return 0;
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function serverUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

export function spawnDetachedServer(port: number): void {
  const serverEntry = fileURLToPath(
    new URL("../server/index.ts", import.meta.url),
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx/esm", serverEntry, "--port", String(port)],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
}

export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? { executable: "open", args: [url] }
      : process.platform === "win32"
        ? { executable: "cmd", args: ["/c", "start", "", url] }
        : { executable: "xdg-open", args: [url] };

  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
