import type { ServerRecord } from "../server/runtime.js";
import { serverUrl } from "./server-api.js";

interface FileEntry {
  id: string;
  absPath: string;
  title: string;
}
interface FileResult {
  entries: FileEntry[];
  workspaceId?: string;
  activeWorkspaceId?: string;
}
/**
 * Registers files and resolves the server's committed entries, including existing files.
 * @param record - Connected server identity
 * @param files - Absolute requested paths
 * @param fetchFn - HTTP transport
 * @returns Resolved entries and workspace context when supplied by the server
 * @throws When registration fails or the server response is malformed
 */
export async function addFiles(
  record: ServerRecord,
  files: string[],
  fetchFn: typeof globalThis.fetch,
): Promise<FileResult> {
  const response = await fetchFn(`${serverUrl(record.port)}api/session/add`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zatto-instance-id": record.instanceId,
    },
    body: JSON.stringify({ paths: files }),
  });
  if (!response.ok) {
    throw new Error(
      `ファイルの追加に失敗しました (HTTP ${response.status}): ${files.map(terminalLine).join(", ")}`,
    );
  }
  const body: unknown = await response.json();
  if (!isObject(body)) throw new Error("ファイル追加の応答が不正です");
  const session = isObject(body.session) ? body.session : {};
  const candidates = Array.isArray(body.resolved)
    ? body.resolved
    : [
        ...(Array.isArray(session.entries) ? session.entries : []),
        ...(Array.isArray(body.added) ? body.added : []),
      ];
  return {
    entries: candidates.filter(isEntry),
    workspaceId: stringValue(body.workspaceId),
    activeWorkspaceId: stringValue(body.activeWorkspaceId),
  };
}
/**
 * Writes copyable title/URL pairs after the caller's top-level URL line.
 * @param baseUrl - Connected server URL
 * @param files - Requested paths, including duplicates
 * @param result - Registration response
 * @param stdout - Output line writer
 * @param stderr - Diagnostic line writer
 * @returns Nothing
 * @throws When output writers fail
 */
export function printFileUrls(
  baseUrl: string,
  files: string[],
  result: FileResult,
  stdout: (line: string) => void,
  stderr: (line: string) => void,
): void {
  const byPath = new Map(result.entries.map((entry) => [entry.absPath, entry]));
  for (const file of new Set(files)) {
    const entry = byPath.get(file);
    if (!entry) {
      stderr(`ファイルを登録できませんでした: ${terminalLine(file)}`);
      continue;
    }
    const url = new URL(baseUrl);
    url.searchParams.set("entry", entry.id);
    const title = terminalLine(entry.title);
    stdout(`\n${title.trim() ? title : terminalLine(file)}\n${url.href}`);
  }
  if (
    result.workspaceId &&
    result.activeWorkspaceId &&
    result.workspaceId !== result.activeWorkspaceId
  ) {
    stderr(
      `ワークスペースが切り替わりました。URLを開く前に登録先 (${terminalLine(result.workspaceId)}) を選択してください。`,
    );
  }
}
function terminalLine(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ");
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isEntry(value: unknown): value is FileEntry {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.absPath === "string" &&
    typeof value.title === "string"
  );
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
