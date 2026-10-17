import path from "node:path";
import { DEFAULT_PORT } from "../server/index.js";
import type { ServerRecord } from "../server/runtime.js";
import type { Entry } from "../server/session.js";
import type { ServerMessage } from "../shared/protocol.js";
import type {
  ReviewAuthor,
  ReviewEvent,
  ReviewThread,
} from "../shared/review.js";
import { rpcCall } from "../shared/rpc-client.js";
import { serverUrl } from "./server-api.js";
import type { ServerClientDependencies } from "./server-client.js";
import { connectOrStartServer } from "./server-client.js";

export const REVIEW_USAGE = `Usage:
  zatto review <file> --session <id> [--json] [--no-open] [--port <n>]
  zatto review --inbox --session <id> [--json] [--port <n>]
  zatto review reply <thread-id> <body> --session <id> [--port <n>]

<file> を選択中のワークスペースへ登録してレビュー中にし、ユーザーの操作を待ちます。
--inbox は、ユーザーが画面でこのセッションを送り先に選んだファイルの操作を待ちます。
ユーザーがコメント・返信を書くか、Finish review を押すと、その内容を表示して終了します。
対応したら、同じコマンドをもう一度実行して待ちを続けます。
reply は、スレッドにこのセッションとして返信します。`;

const LISTEN_REFRESH_MS = 5 * 60 * 1000;

type ReviewOptions =
  | {
      mode: "file";
      file: string;
      session: string;
      json: boolean;
      open: boolean;
      port: number;
    }
  | { mode: "inbox"; session: string; json: boolean; port: number }
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
}

interface ThreadReport {
  entry: { id: string; title: string; path: string };
  finished: boolean;
  threads: ReviewThread[];
}

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
  let socket: WebSocket | undefined;
  let stopInterrupt = () => {};
  let refresh: ReturnType<typeof setInterval> | undefined;
  try {
    const { record } = await connectOrStartServer(options.port, dependencies);
    const call = rpc(record, dependencies.fetch);
    if (options.mode === "reply") {
      await call("review.reply", {
        threadId: options.threadId,
        author: { kind: "llm", session: options.session },
        body: options.body,
      });
      dependencies.stdout(`返信しました: thread ${options.threadId}`);
      return 0;
    }

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
    await call("review.listen", { session: options.session });
    refresh = setInterval(() => {
      void call("review.listen", { session: options.session }).catch(
        () => undefined,
      );
    }, LISTEN_REFRESH_MS);

    if (options.mode === "file") {
      const startedAt = Date.now();
      const workspaceId = (await call("workspaces.list", {})).activeWorkspaceId;
      const added = await call("session.add", {
        paths: [options.file],
        workspaceId,
      });
      const entry = added.resolved[0];
      if (!entry)
        throw new Error(`ファイルを登録できませんでした: ${options.file}`);
      const review = await call("review.start", {
        workspaceId,
        entryId: entry.id,
        session: options.session,
      });
      const url = new URL(serverUrl(record.port));
      url.searchParams.set("entry", entry.id);
      dependencies.stderr(
        `レビュー中にしました。ユーザーのコメントを待ちます: ${url.href}`,
      );
      if (options.open && review.createdAt >= startedAt)
        dependencies.openBrowser(url.href);
    } else {
      dependencies.stderr(
        `${options.session} として、レビュー中のファイルへのユーザーのコメントを待ちます`,
      );
    }

    const events = await waitForEvents(
      opened,
      () => call("review.take", { session: options.session }),
      options.session,
      (handler) => {
        stopInterrupt =
          dependencies.onInterrupt?.(() => {
            void call("review.unlisten", { session: options.session })
              .catch(() => undefined)
              .finally(handler);
          }) ?? stopInterrupt;
      },
    );
    if (events === null) {
      dependencies.stderr("待機をやめました");
      return 130;
    }
    const reports = await collectReports(call, events);
    dependencies.stdout(
      options.json
        ? JSON.stringify({ session: options.session, reports }, null, 2)
        : formatReports(reports, options.session),
    );
    return 0;
  } catch (error) {
    dependencies.stderr(errorMessage(error));
    return 1;
  } finally {
    if (refresh) clearInterval(refresh);
    stopInterrupt();
    socket?.close();
  }
}

/** Resolves with queued events, waiting for a notification when none are queued; null when interrupted. */
async function waitForEvents(
  socket: WebSocket,
  take: () => Promise<{ events: ReviewEvent[] }>,
  session: string,
  onInterrupt: (handler: () => void) => void,
): Promise<ReviewEvent[] | null> {
  return new Promise((resolve, reject) => {
    let checking = Promise.resolve();
    let done = false;
    const check = () => {
      checking = checking.then(async () => {
        if (done) return;
        const { events } = await take();
        if (events.length && !done) {
          done = true;
          resolve(events);
        }
      });
      checking.catch((error) => {
        done = true;
        reject(error);
      });
    };
    socket.addEventListener("message", (event) => {
      const message = parseMessage(event.data);
      if (message?.type === "review:event" && message.session === session)
        check();
    });
    socket.addEventListener("close", () => {
      if (done) return;
      done = true;
      reject(new Error("待っている間に zatto サーバーが停止しました"));
    });
    onInterrupt(() => {
      done = true;
      resolve(null);
    });
    check();
  });
}

async function collectReports(
  call: ReturnType<typeof rpc>,
  events: ReviewEvent[],
): Promise<ThreadReport[]> {
  const reports: ThreadReport[] = [];
  const byEntry = new Map<string, ReviewEvent[]>();
  for (const event of events)
    byEntry.set(event.entryId, [...(byEntry.get(event.entryId) ?? []), event]);
  for (const [entryId, entryEvents] of byEntry) {
    const workspaceId = entryEvents[0]?.workspaceId ?? "";
    const entry: Entry | undefined = (
      await call("workspaces.get", { id: workspaceId })
    ).entries.find((item) => item.id === entryId);
    if (!entry) continue;
    const { threads } = await call("review.list", { workspaceId, entryId });
    const finished = entryEvents.some((event) => event.kind === "finished");
    const commented = new Set(
      entryEvents.flatMap((event) =>
        event.kind === "comment" ? [event.threadId] : [],
      ),
    );
    reports.push({
      entry: { id: entry.id, title: entry.title, path: entry.absPath },
      finished,
      threads: finished
        ? threads.filter((thread) => !thread.resolved)
        : threads.filter((thread) => commented.has(thread.id)),
    });
  }
  return reports;
}

export function parseReviewArgs(args: string[]): ReviewOptions {
  let session: string | undefined;
  let port = DEFAULT_PORT;
  let json = false;
  let open = true;
  let inbox = false;
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") json = true;
    else if (arg === "--no-open") open = false;
    else if (arg === "--inbox") inbox = true;
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
  if (inbox) {
    if (positionals.length)
      throw new Error("--inbox ではファイルを指定できません");
    return { mode: "inbox", session, json, port };
  }
  if (!positionals[0])
    throw new Error("レビューするファイルを指定してください");
  if (positionals.length > 1)
    throw new Error("レビューするファイルは 1 つだけ指定してください");
  return {
    mode: "file",
    file: path.resolve(positionals[0]),
    session,
    json,
    open,
    port,
  };
}

/** Formats reports so an LLM can address each thread by its ID and quoted text. */
export function formatReports(
  reports: ThreadReport[],
  session: string,
): string {
  const lines: string[] = [];
  for (const report of reports) {
    if (lines.length) lines.push("");
    lines.push(
      report.finished
        ? `ユーザーがレビューを終えました: ${report.entry.title} (${report.entry.path})`
        : `ユーザーのコメント: ${report.entry.title} (${report.entry.path})`,
    );
    if (report.finished && !report.threads.length)
      lines.push("未解決のコメントはありません。");
    else if (report.finished)
      lines.push(`未解決のスレッド: ${report.threads.length} 件`);
    for (const thread of report.threads) {
      lines.push("", `[thread ${thread.id}]`);
      lines.push(
        thread.anchor
          ? `対象の文章: ${JSON.stringify(thread.anchor.exact)}`
          : "対象: 資料全体",
      );
      for (const comment of thread.comments)
        lines.push(`- ${authorLabel(comment.author)}: ${comment.body}`);
    }
  }
  lines.push(
    "",
    `返信: zatto review reply <thread-id> "<本文>" --session ${session}`,
    "対応したら、同じ zatto review のコマンドをもう一度実行して待ちを続けてください。",
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
