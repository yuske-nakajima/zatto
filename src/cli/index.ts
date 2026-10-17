import { randomUUID } from "node:crypto";
import { APP_VERSION } from "../meta.js";
import { resolveRuntimeFilePath } from "../server/runtime.js";
import { runAgentCommand } from "./agent-command.js";
import { createAgentContextReader } from "./agent-context-client.js";
import { type CliOptions, parseCliArgs } from "./args.js";
import { addFiles, printFileUrls } from "./file-urls.js";
import { HELP_TEXT } from "./help.js";
import { runMcpCommand } from "./mcp-command.js";
import { openBrowser, spawnDetachedServer } from "./platform.js";
import { exportSession, importSession, serverUrl } from "./server-api.js";
import {
  connectOrStartServer,
  type ServerClientDependencies,
} from "./server-client.js";
import { stopRecordedServer } from "./server-stop.js";
import {
  readSessionExchangeFile,
  writeSessionExchangeFile,
} from "./session-file.js";

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

export async function runCli(
  args: string[],
  overrides: Partial<CliDependencies> = {},
): Promise<number> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const readContext = createAgentContextReader(dependencies);
  if (args[0] === "agent") {
    return runAgentCommand(args.slice(1), {
      readContext,
      stdout: dependencies.stdout,
      stderr: dependencies.stderr,
    });
  }
  if (args[0] === "mcp") {
    return runMcpCommand(args.slice(1), {
      readContext,
      stdout: dependencies.stdout,
      stderr: dependencies.stderr,
    });
  }
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
    const result =
      options.files.length > 0
        ? await addFiles(connection.record, options.files, dependencies.fetch)
        : null;
    dependencies.stdout(url);
    if (result)
      printFileUrls(
        url,
        options.files,
        result,
        dependencies.stdout,
        dependencies.stderr,
      );
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

export { parseCliArgs } from "./args.js";
export { HELP_TEXT } from "./help.js";
export { openBrowser, spawnDetachedServer } from "./platform.js";
