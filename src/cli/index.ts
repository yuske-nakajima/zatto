import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { APP_VERSION } from "../meta.js";
import { DEFAULT_PORT } from "../server/index.js";
import { resolveRuntimeFilePath } from "../server/runtime.js";
import { HELP_TEXT } from "./help.js";
import { openBrowser, spawnDetachedServer } from "./platform.js";
import {
  addFiles,
  exportSession,
  importSession,
  serverUrl,
} from "./server-api.js";
import {
  connectOrStartServer,
  type ServerClientDependencies,
} from "./server-client.js";
import { stopRecordedServer } from "./server-stop.js";
import {
  readSessionExchangeFile,
  writeSessionExchangeFile,
} from "./session-file.js";

interface CliOptions {
  files: string[];
  port: number;
  open: boolean;
  stop: boolean;
  importFile: string | null;
  exportFile: string | null;
  help: boolean;
  version: boolean;
}

interface CliDependencies extends ServerClientDependencies {
  openBrowser: (url: string) => void;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

const defaultDependencies: CliDependencies = {
  fetch: globalThis.fetch,
  spawnServer: spawnDetachedServer,
  openBrowser,
  wait: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  runtimeFilePath: resolveRuntimeFilePath(),
  createInstanceId: randomUUID,
};

export function parseCliArgs(args: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
      open: { type: "boolean", default: true },
      stop: { type: "boolean", default: false },
      import: { type: "string" },
      export: { type: "string" },
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

  if (values.import === "" || values.export === "") {
    throw new Error("セッションファイルには空でないパスを指定してください");
  }
  const importFile = values.import ? path.resolve(values.import) : null;
  const exportFile = values.export ? path.resolve(values.export) : null;
  const operationCount = [
    values.stop,
    importFile,
    exportFile,
    positionals.length > 0,
  ].filter(Boolean).length;
  if (operationCount > 1) {
    throw new Error(
      "`--import`、`--export`、`--stop`、HTML ファイルは同時に指定できません",
    );
  }

  return {
    files: positionals.map((file) => path.resolve(file)),
    port,
    open: values.open ?? true,
    stop: values.stop ?? false,
    importFile,
    exportFile,
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
    dependencies.stderr(errorMessage(error));
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
  try {
    const importedExchange = options.importFile
      ? await readSessionExchangeFile(options.importFile)
      : null;
    const connection = await connectOrStartServer(options.port, dependencies);
    if (options.importFile && importedExchange) {
      await importSession(
        connection.record,
        importedExchange,
        dependencies.fetch,
      );
      dependencies.stdout(
        `セッションをインポートしました: ${options.importFile}`,
      );
      return 0;
    }
    if (options.exportFile) {
      const exchange = await exportSession(
        connection.record,
        dependencies.fetch,
      );
      await writeSessionExchangeFile(options.exportFile, exchange);
      dependencies.stdout(
        `セッションをエクスポートしました: ${options.exportFile}`,
      );
      return 0;
    }
    const url = serverUrl(connection.record.port);
    if (options.files.length > 0) {
      await addFiles(connection.record, options.files, dependencies.fetch);
    }
    dependencies.stdout(url);
    if (options.open && (connection.started || options.files.length === 0)) {
      dependencies.openBrowser(url);
    }
    return 0;
  } catch (error) {
    dependencies.stderr(errorMessage(error));
    return 1;
  }
}

export async function main(args: string[]): Promise<number> {
  return runCli(args);
}

async function stopServer(
  preferredPort: number,
  dependencies: CliDependencies,
): Promise<number> {
  try {
    const result = await stopRecordedServer(preferredPort, dependencies);
    if (result.stopped) {
      dependencies.stdout(`zatto サーバーを停止しました (${result.port})`);
    } else {
      dependencies.stdout("zatto サーバーは起動していません");
    }
    return 0;
  } catch (error) {
    dependencies.stderr(errorMessage(error));
    return 1;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { HELP_TEXT } from "./help.js";
export { openBrowser, spawnDetachedServer } from "./platform.js";
