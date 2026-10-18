import path from "node:path";
import { DEFAULT_PORT } from "../server/index.js";
import type { ServerRecord } from "../server/runtime.js";
import { zattoCliCommand } from "../server/zatto-cli.js";
import type { ServerMessage } from "../shared/protocol.js";
import type {
  ReviewAuthor,
  ReviewEvent,
  ReviewThread,
} from "../shared/review.js";
import { rpcCall } from "../shared/rpc-client.js";
import { serverUrl } from "./server-api.js";
import type { ServerClientDependencies } from "./server-client.js";
import {
  connectOrStartServer,
  connectToRunningServer,
} from "./server-client.js";

export const REVIEW_USAGE = `Usage:
  zatto review <file> --session <id> [--once] [--no-open] [--port <n>]
  zatto review reply <thread-id> <body> --session <id> [--port <n>]

<file> を選択中のワークスペースへ登録してレビュー中にし、ユーザーのコメントを待ち続けます。
ユーザーがコメント・返信を書くたびに、内容を 1 行の JSON で出力します。Finish review で終了します。
zatto が停止・再起動しても、起動を待って自動で再接続します。Ctrl+C で終了します。
--once は、最初に届いた内容を読みやすい形で表示して終了します。
reply は、スレッドにこのセッションとして返信します。`;

const RECONNECT_INTERVAL_MS = 2_000;

type FileOptions = {
  mode: "file";
  file: string;
  session: string;
  once: boolean;
  open: boolean;
  port: number;
};

type ReviewOptions =
  | FileOptions
  | {
      mode: "reply";
      threadId: string;
      body: string;
      session: string;
      port: number;
    };

export interface ReviewCommandDependencies extends ServerClientDependencies {
  openBrowser: (url: string) => void;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  createWebSocket?: (url: string) => WebSocket;
  onInterrupt?: (handler: () => void) => () => void;
  reconnectIntervalMs?: number;
}

/** One delivered user action with the thread state an LLM needs to answer it. */
export interface ReviewReport {
  event: "comment" | "finished";
  file: { id: string; title: string; path: string };
  threads: ReviewThread[];
}

type Call = ReturnType<typeof rpc>;
type Outcome = "done" | "interrupted" | "disconnected";

/**
 * Runs the review commands an LLM uses to receive and answer the user's comments.
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
  if (options.mode === "reply") {
    try {
      const { record } = await connectOrStartServer(options.port, dependencies);
      await rpc(record, dependencies.fetch)("review.reply", {
        threadId: options.threadId,
        author: { kind: "llm", session: options.session },
        body: options.body,
      });
      dependencies.stdout(`返信しました: thread ${options.threadId}`);
      return 0;
    } catch (error) {
      dependencies.stderr(errorMessage(error));
      return 1;
    }
  }

  const interruption = createInterruption();
  const stopInterrupt =
    dependencies.onInterrupt?.(interruption.trigger) ?? (() => {});
  try {
    let record = (await connectOrStartServer(options.port, dependencies))
      .record;
    for (let first = true; ; first = false) {
      const outcome = await follow(
        record,
        options,
        dependencies,
        first,
        interruption,
      );
      if (outcome === "done") return 0;
      if (outcome === "interrupted") return 130;
      dependencies.stderr(
        "zatto サーバーとの接続が切れました。起動を待って再接続します",
      );
      const next = await waitForServer(dependencies, interruption);
      if (!next) return 130;
      record = next;
    }
  } catch (error) {
    dependencies.stderr(errorMessage(error));
    return 1;
  } finally {
    stopInterrupt();
  }
}

interface Interruption {
  readonly interrupted: boolean;
  trigger: () => void;
  wait: () => Promise<void>;
}

function createInterruption(): Interruption {
  let interrupted = false;
  let wake = () => {};
  const signal = new Promise<void>((resolve) => {
    wake = resolve;
  });
  return {
    get interrupted() {
      return interrupted;
    },
    trigger() {
      interrupted = true;
      wake();
    },
    wait: () => signal,
  };
}

/** Keeps the file under review on one server connection and prints what the user does. */
async function follow(
  record: ServerRecord,
  options: FileOptions,
  dependencies: ReviewCommandDependencies,
  announce: boolean,
  interruption: Interruption,
): Promise<Outcome> {
  const call = rpc(record, dependencies.fetch);
  const socket = (
    dependencies.createWebSocket ?? ((url) => new WebSocket(url))
  )(`ws://127.0.0.1:${record.port}/ws`);
  let closed = false;
  socket.addEventListener("close", () => {
    closed = true;
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("zatto サーバーへの通知の接続に失敗しました")),
        { once: true },
      );
    });
    // 確認状態はサーバーのメモリーにだけあるため、接続のたびに張り直す
    const startedAt = Date.now();
    const workspaceId = (await call("workspaces.list", {})).activeWorkspaceId;
    const entry = (
      await call("session.add", { paths: [options.file], workspaceId })
    ).resolved[0];
    if (!entry)
      throw new Error(`ファイルを登録できませんでした: ${options.file}`);
    const review = await call("review.start", {
      workspaceId,
      entryId: entry.id,
      session: options.session,
    });
    if (announce) {
      const url = new URL(serverUrl(record.port));
      url.searchParams.set("entry", entry.id);
      dependencies.stderr(
        `レビュー中にしました。ユーザーのコメントを待ちます: ${url.href}`,
      );
      if (options.open && review.createdAt >= startedAt)
        dependencies.openBrowser(url.href);
    }

    return await new Promise<Outcome>((resolve, reject) => {
      let settled = false;
      let checking = Promise.resolve();
      const settle = (outcome: Outcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };
      const deliver = async () => {
        const { events } = await call("review.take", {
          session: options.session,
          entryId: entry.id,
        });
        const reports = await collectReports(call, events);
        if (!reports.length) return;
        if (options.once) {
          dependencies.stdout(
            formatReports(reports, options.session, zattoCliCommand()),
          );
          settle("done");
          return;
        }
        for (const report of reports)
          dependencies.stdout(JSON.stringify(report));
        // 終えたレビューを再接続で張り直さないよう、終了の通知で待機も終える
        if (reports.some((report) => report.event === "finished"))
          settle("done");
      };
      const check = () => {
        checking = checking
          .then(async () => {
            if (!settled) await deliver();
          })
          .catch((error) => {
            if (settled) return;
            if (closed) settle("disconnected");
            else {
              settled = true;
              reject(error);
            }
          });
      };
      socket.addEventListener("message", (event) => {
        const message = parseMessage(event.data);
        if (
          message?.type === "review:event" &&
          message.session === options.session
        )
          check();
      });
      socket.addEventListener("close", () => settle("disconnected"));
      void interruption.wait().then(() => settle("interrupted"));
      if (closed) settle("disconnected");
      check();
    });
  } catch (error) {
    if (interruption.interrupted) return "interrupted";
    if (closed || socket.readyState !== WebSocket.OPEN) return "disconnected";
    throw error;
  } finally {
    socket.close();
  }
}

/** Waits until a managed server is running again; null when interrupted. */
async function waitForServer(
  dependencies: ReviewCommandDependencies,
  interruption: Interruption,
): Promise<ServerRecord | null> {
  for (;;) {
    if (interruption.interrupted) return null;
    try {
      return await connectToRunningServer(dependencies);
    } catch {
      await Promise.race([
        new Promise((resolve) =>
          setTimeout(
            resolve,
            dependencies.reconnectIntervalMs ?? RECONNECT_INTERVAL_MS,
          ),
        ),
        interruption.wait(),
      ]);
    }
  }
}

async function collectReports(
  call: Call,
  events: ReviewEvent[],
): Promise<ReviewReport[]> {
  const reports: ReviewReport[] = [];
  for (const event of events) {
    const entry = (
      await call("workspaces.get", { id: event.workspaceId })
    ).entries.find((item) => item.id === event.entryId);
    if (!entry) continue;
    const { threads } = await call("review.list", {
      workspaceId: event.workspaceId,
      entryId: event.entryId,
    });
    reports.push({
      event: event.kind,
      file: { id: entry.id, title: entry.title, path: entry.absPath },
      threads:
        event.kind === "finished"
          ? threads.filter((thread) => !thread.resolved)
          : threads.filter((thread) => thread.id === event.threadId),
    });
  }
  return reports;
}

export function parseReviewArgs(args: string[]): ReviewOptions {
  let session: string | undefined;
  let port = DEFAULT_PORT;
  let once = false;
  let open = true;
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--once") once = true;
    else if (arg === "--no-open") open = false;
    else if (arg === "--session" || arg === "--port") {
      const value = args[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} の値を指定してください`);
      index += 1;
      if (arg === "--session") session = value;
      else {
        port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
          throw new Error("`--port` には 1〜65535 の整数を指定してください");
      }
    } else if (arg?.startsWith("--"))
      throw new Error(`不明なオプション: ${arg}`);
    else if (arg !== undefined) positionals.push(arg);
  }
  if (!session) throw new Error("--session でセッション ID を指定してください");
  if (positionals[0] === "reply") {
    const [, threadId, body, ...rest] = positionals;
    if (!threadId || !body?.trim() || rest.length)
      throw new Error(
        "reply にはスレッド ID と本文を 1 つずつ指定してください",
      );
    return { mode: "reply", threadId, body, session, port };
  }
  if (!positionals[0])
    throw new Error("レビューするファイルを指定してください");
  if (positionals.length > 1)
    throw new Error("レビューするファイルは 1 つだけ指定してください");
  return {
    mode: "file",
    file: path.resolve(positionals[0]),
    session,
    once,
    open,
    port,
  };
}

/** Formats reports so an LLM can address each thread by its ID and quoted text. */
export function formatReports(
  reports: ReviewReport[],
  session: string,
  cli = "zatto",
): string {
  const lines: string[] = [];
  for (const report of reports) {
    if (lines.length) lines.push("");
    lines.push(
      report.event === "finished"
        ? `ユーザーがレビューを終えました: ${report.file.title} (${report.file.path})`
        : `ユーザーのコメント: ${report.file.title} (${report.file.path})`,
    );
    if (report.event === "finished")
      lines.push(
        report.threads.length
          ? `未解決のスレッド: ${report.threads.length} 件`
          : "未解決のコメントはありません。",
      );
    for (const thread of report.threads) {
      lines.push("", `[thread ${thread.id}]`);
      lines.push(
        thread.anchor
          ? `対象の文章: ${JSON.stringify(thread.anchor.exact)}`
          : "対象: 資料全体",
      );
      for (const comment of thread.comments) {
        lines.push(`- ${authorLabel(comment.author)}: ${comment.body}`);
        for (const attachment of comment.attachments ?? [])
          lines.push(`  画像: ${attachment.path}`);
      }
    }
  }
  lines.push(
    "",
    `返信: ${cli} review reply <thread-id> "<本文>" --session ${session}`,
    "返信の本文は、段落・箇条書き・太字・インラインコード・コードブロック・リンクの Markdown で書けます。",
  );
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
