import { pathToFileURL } from "node:url";

/**
 * ESMモジュールがプロセスのエントリーとして直接実行されたか判定する。
 *
 * @param moduleUrl - 判定対象モジュールのURL
 * @param entryPath - プロセスが受け取ったエントリーファイルのパス
 * @returns モジュールURLと正規化したエントリーパスが一致する場合はtrue
 */
export function isDirectExecution(
  moduleUrl: string,
  entryPath: string | undefined,
): boolean {
  return entryPath !== undefined && moduleUrl === pathToFileURL(entryPath).href;
}
