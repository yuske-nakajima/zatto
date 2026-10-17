import path from "node:path";
import { DEFAULT_PORT } from "../server/index.js";
import type { ServerRecord } from "../server/runtime.js";
import type { ServerMessage } from "../shared/protocol.js";
import type { ReviewAuthor, ReviewThread } from "../shared/review.js";
import { rpcCall } from "../shared/rpc-client.js";
import { serverUrl } from "./server-api.js";
import type { ServerClientDependencies } from "./server-client.js";
import { connectOrStartServer } from "./server-client.js";

export const REVIEW_USAGE = `Usage: zatto review <file> [--session <id>] [--json] [--no-open] [--port <n>]

ファイルを選択中のワークスペースへ登録して確認を依頼し、ユーザーが確認を終えるまで待ちます。
確認が終わると、未解決のコメントのスレッドを標準出力へ表示して終了します。`;

interface ReviewOptions {
  file: string;
  session?: string;
  json: boolean;
  open: boolean;
  port: number;
}

export interface ReviewCommandDependencies extends ServerClientDependencies {
  openBrowser: (url: string) => void;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  createWebSocket?: (url: string) => WebSocket;
  onInterrupt?: (handler: () => void) => () => void;
}

/**
 * Asks the user to review a file and returns their open comment threads when they finish.
 * @param args - Arguments after `review`
 * @param dependencies - Server connection, browser, output, and process hooks
 * @returns Exit code
 * @throws Never; failures are reported on stderr
 */
export async function runReviewCommand(
  args: string[],
  dependencies: ReviewCommandDependencies,
): Promise<number> {
  let options: ReviewOptions;
  try {
    options = parseReviewArgs(args);
  } catch (error) {
    dependencies.stderr(errorMessage(error));
    dependencies.stderr(REVIEW_USAGE);
    return 1;
  }
  let socket: WebSocket | undefined;
  let stopInterrupt = () => {};
  try {
    const { record } = await connectOrStartServer(options.port, dependencies);
    const call = rpc(record, dependencies.fetch);
    const workspaceId = (await call("workspaces.list", {})).activeWorkspaceId;
    const added = await call("session.add", {
      paths: [options.file],
      workspaceId,
    });
    const entry = added.resolved[0];
    if (!entry)
      throw new Error(`ファイルを登録できませんでした: ${options.file}`);

    socket = (dependencies.createWebSocket ?? ((url) => new WebSocket(url)))(
      `ws://127.0.0.1:${record.port}/ws`,
    );
    const opened = socket;
    await new Promise<void>((resolve, reject) => {
      opened.addEventListener("open", () => resolve(), { once: true });
      opened.addEventListener(
        "error",
        () => reject(new Error("zatto サーバーへの通知の接続に失敗しました")),
        { once: true },
      );
    });
    const request = await call("review.request", {
      workspaceId,
      entryId: entry.id,
      ...(options.session ? { session: options.session } : {}),
    });
    const url = new URL(serverUrl(record.port));
    url.searchParams.set("entry", entry.id);
    dependencies.stderr(
      `確認を依頼しました。ブラウザーで確認を終えるまで待ちます: ${url.href}`,
    );
    if (options.open) dependencies.openBrowser(url.href);

    const outcome = await new Promise<"completed" | "cancelled">(
      (resolve, reject) => {
        opened.addEventListener("message", (event) => {
          const message = parseMessage(event.data);
          if (
            message?.type === "review:completed" &&
            message.requestId === request.id
          )
            resolve("completed");
        });
        opened.addEventListener("close", () =>
          reject(
            new Error("確認の完了を待つ間に zatto サーバーが停止しました"),
          ),
        );
        stopInterrupt =
          dependencies.onInterrupt?.(() => {
            void call("review.cancel", { requestId: request.id })
              .catch(() => undefined)
              .finally(() => resolve("cancelled"));
          }) ?? stopInterrupt;
      },
    );
    if (outcome === "cancelled") {
      dependencies.stderr("確認の依頼を取り消しました");
      return 130;
    }

    const { threads } = await call("review.list", {
      workspaceId,
      entryId: entry.id,
    });
    const open = threads.filter((thread) => !thread.resolved);
    dependencies.stdout(
      options.json
        ? JSON.stringify(
            {
              entry: { id: entry.id, title: entry.title, path: entry.absPath },
              threads: open,
            },
            null,
            2,
          )
        : formatThreads(entry.title, entry.absPath, open),
    );
    return 0;
  } catch (error) {
    dependencies.stderr(errorMessage(error));
    return 1;
  } finally {
    stopInterrupt();
    socket?.close();
  }
}

export function parseReviewArgs(args: string[]): ReviewOptions {
  const options: Partial<ReviewOptions> & { json: boolean; open: boolean } = {
    json: false,
    open: true,
    port: DEFAULT_PORT,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--session" || arg === "--port") {
      const value = args[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} の値を指定してください`);
      index += 1;
      if (arg === "--session") options.session = value;
      else {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
          throw new Error("`--port` には 1〜65535 の整数を指定してください");
        options.port = port;
      }
    } else if (arg?.startsWith("--"))
      throw new Error(`不明なオプション: ${arg}`);
    else if (options.file)
      throw new Error("確認するファイルは 1 つだけ指定してください");
    else if (arg) options.file = path.resolve(arg);
  }
  if (!options.file) throw new Error("確認するファイルを指定してください");
  return options as ReviewOptions;
}

/** Formats open threads so an LLM can address each one by its ID and quoted text. */
export function formatThreads(
  title: string,
  absPath: string,
  threads: ReviewThread[],
): string {
  const lines = [`確認が終わりました: ${title} (${absPath})`];
  if (!threads.length) {
    lines.push("未解決のコメントはありません。");
    return lines.join("\n");
  }
  lines.push(`未解決のスレッド: ${threads.length} 件`);
  for (const thread of threads) {
    lines.push("", `[thread ${thread.id}]`);
    lines.push(
      thread.anchor
        ? `対象の文章: ${JSON.stringify(thread.anchor.exact)}`
        : "対象: 資料全体",
    );
    for (const comment of thread.comments)
      lines.push(`- ${authorLabel(comment.author)}: ${comment.body}`);
  }
  return lines.join("\n");
}

function authorLabel(author: ReviewAuthor): string {
  if (author.kind === "user") return "ユーザー";
  return author.session ? `LLM (${author.session})` : "LLM";
}

function rpc(record: ServerRecord, fetchFn: typeof globalThis.fetch) {
  return <M extends Parameters<typeof rpcCall>[0]>(
    method: M,
    params: Parameters<typeof rpcCall<M>>[1],
  ) =>
    rpcCall(
      method,
      { ...params, instanceId: record.instanceId },
      { endpoint: `${serverUrl(record.port)}rpc`, fetch: fetchFn },
    );
}

function parseMessage(data: unknown): ServerMessage | null {
  try {
    return JSON.parse(String(data)) as ServerMessage;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
