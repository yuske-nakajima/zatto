import { parseArgs } from "node:util";
import type { startServer } from "./index.js";

/**
 * サーバーエントリーのCLI引数を解釈してサーバーを起動する。
 *
 * @param serverStarter - サーバー起動処理
 * @param defaultPort - port引数を省略した場合のポート
 * @param args - 解釈するCLI引数
 * @returns なし
 */
export function runServerCommand(
  serverStarter: typeof startServer,
  defaultPort: number,
  args: string[],
): void {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", default: String(defaultPort) },
      "instance-id": { type: "string" },
      "runtime-file": { type: "string" },
    },
  });

  void serverStarter(Number(values.port), {
    instanceId: values["instance-id"],
    runtimeFilePath: values["runtime-file"],
  }).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
