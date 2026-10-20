import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_PORT } from "../server/index.js";

/** Parsed file-viewer CLI operations and startup preferences. */
export interface CliOptions {
  files: string[];
  port: number;
  /** 外の端末からの閲覧を受け付けるアドレス。 */
  host: string | null;
  open: boolean;
  stop: boolean;
  importFile: string | null;
  exportFile: string | null;
  help: boolean;
  version: boolean;
}

/**
 * Parses viewer arguments and resolves positional paths against the working directory.
 * @param args - CLI arguments without executable names
 * @returns Validated options
 * @throws When arguments or operation combinations are invalid
 */
export function parseCliArgs(args: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
      host: { type: "string" },
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

  if (values.host !== undefined && values.host.trim() === "") {
    throw new Error("`--host` には空でないアドレスを指定してください");
  }

  if (values.import === "" || values.export === "") {
    throw new Error("セッションファイルには空でないパスを指定してください");
  }
  if (positionals.some((file) => file.length === 0)) {
    throw new Error("ファイルには空でないパスを指定してください");
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
    host: values.host?.trim() ?? null,
    open: values.open ?? true,
    stop: values.stop ?? false,
    importFile,
    exportFile,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}
