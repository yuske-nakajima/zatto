import type { ServerRecord } from "../server/runtime.js";
import { rpcCall } from "../shared/rpc-client.js";
import { activeWorkspaceId, serverUrl } from "./server-api.js";

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
  const body = await rpcCall(
    "session.add",
    {
      paths: files,
      instanceId: record.instanceId,
      workspaceId: await activeWorkspaceId(record, fetchFn),
    },
    {
      endpoint: `${serverUrl(record.port)}rpc`,
      fetch: fetchFn,
    },
  );
  return {
    entries: body.resolved,
    workspaceId: body.workspaceId,
    activeWorkspaceId: body.activeWorkspaceId,
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
