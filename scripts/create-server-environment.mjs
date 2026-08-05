import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * package consumer検証をホスト上のlegacy serverから分離する環境を作る。
 *
 * @param options - consumerディレクトリとruntime保存先
 * @returns consumer検証用のプロセス環境
 * @throws fetch分離モジュールを作成できない場合
 */
export async function createServerEnvironment(options) {
  const fetchIsolationPath = path.join(
    options.consumerDirectory,
    "isolate-legacy-ports.mjs",
  );
  await writeFile(
    fetchIsolationPath,
    [
      "const hostFetch = globalThis.fetch;",
      "globalThis.fetch = (input, init) => {",
      "  const url = new URL(input instanceof Request ? input.url : input);",
      "  const port = Number(url.port);",
      '  if (url.hostname === "127.0.0.1" && port >= 6280 && port < 6290) {',
      "    return Promise.resolve(new Response(null, { status: 404 }));",
      "  }",
      "  return hostFetch(input, init);",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
  const importIsolation = `--import=${pathToFileURL(fetchIsolationPath).href}`;
  return {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, importIsolation]
      .filter(Boolean)
      .join(" "),
    ZATTO_RUNTIME_FILE: options.runtimePath,
    ZATTO_SESSION_FILE: options.sessionPath,
  };
}
