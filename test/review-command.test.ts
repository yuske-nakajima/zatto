import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  parseReviewArgs,
  runReviewCommand,
} from "../src/cli/review-command.js";
import { createApp } from "../src/server/app.js";
import {
  SERVER_PROTOCOL_VERSION,
  writeServerRecord,
} from "../src/server/runtime.js";
import { SessionStore } from "../src/server/session.js";
import { zattoCliCommand } from "../src/server/zatto-cli.js";
import type { ActiveReview } from "../src/shared/review.js";
import { REVIEW_REANCHOR_GUIDE } from "../src/shared/review.js";
import { rpc } from "./rpc-server-helper.js";

let dir: string;
let app: FastifyInstance;
let store: SessionStore;
let port: number;
let runtimeFilePath: string;
let file: string;

async function startServer(listenPort = 0): Promise<void> {
  app = await createApp({
    sessionStore: store,
    serverIdentity: {
      instanceId: "review-server",
      protocolVersion: SERVER_PROTOCOL_VERSION,
    },
  });
  await app.listen({ host: "127.0.0.1", port: listenPort });
  const address = app.server.address();
  port = typeof address === "object" && address ? address.port : 0;
  await writeServerRecord(runtimeFilePath, {
    instanceId: "review-server",
    pid: process.pid,
    port,
    protocolVersion: SERVER_PROTOCOL_VERSION,
  });
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-review-cli-"));
  store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
  runtimeFilePath = path.join(dir, "server.json");
  await startServer();
  file = path.join(dir, "plan.md");
  await writeFile(file, "# 計画\n\n閲覧URL を返す\n");
});

afterEach(async () => {
  await app.close().catch(() => undefined);
  await rm(dir, { force: true, recursive: true });
});

function dependencies(onInterrupt?: (handler: () => void) => () => void) {
  return {
    fetch: globalThis.fetch,
    runtimeFilePath,
    spawnServer: vi.fn(),
    wait: async () => {},
    createInstanceId: () => "unused",
    openBrowser: vi.fn(),
    stdout: vi.fn(),
    stderr: vi.fn(),
    onInterrupt,
    reconnectIntervalMs: 20,
  };
}

async function activeReview(): Promise<ActiveReview> {
  return vi.waitFor(async () => {
    const [review] = (await rpc(app, "review.states", {})).json<{
      reviews: ActiveReview[];
    }>().reviews;
    if (!review) throw new Error("not yet");
    return review;
  });
}

function comment(review: ActiveReview, body: string) {
  return rpc(app, "review.create", {
    workspaceId: review.workspaceId,
    entryId: review.entryId,
    anchor: { exact: "閲覧URL", prefix: "", suffix: " を返す" },
    author: { kind: "user" },
    body,
  });
}

function lines(output: ReturnType<typeof vi.fn>) {
  return output.mock.calls.map(([line]) => JSON.parse(String(line)));
}

describe("zatto review", () => {
  test("待ち続け、コメントのたびに 1 行の JSON を出し、レビューの終了で終わる", async () => {
    const deps = dependencies();
    const running = runReviewCommand(
      [file, "--no-open", "--session", "zatto:a99c"],
      deps,
    );
    const review = await activeReview();
    expect(review.session).toBe("zatto:a99c");
    const first = (await comment(review, "具体例は？")).json<{ id: string }>();
    await vi.waitFor(() => expect(deps.stdout).toHaveBeenCalledTimes(1));

    await expect(
      runReviewCommand(
        ["reply", first.id, "例を追記しました", "--session", "zatto:a99c"],
        dependencies(),
      ),
    ).resolves.toBe(0);
    await rpc(app, "review.reply", {
      threadId: first.id,
      author: { kind: "user" },
      body: "ありがとう",
    });
    await vi.waitFor(() => expect(deps.stdout).toHaveBeenCalledTimes(2));
    await rpc(app, "review.finish", { reviewId: review.id });

    await expect(running).resolves.toBe(0);
    const [created, replied, finished] = lines(deps.stdout);
    expect(created).toMatchObject({
      event: "comment",
      file: { path: file, title: "計画" },
      threads: [{ id: first.id, anchor: { exact: "閲覧URL" } }],
      hint: REVIEW_REANCHOR_GUIDE,
    });
    expect(
      replied.threads[0].comments.map(
        (item: { author: { kind: string }; body: string }) => [
          item.author.kind,
          item.body,
        ],
      ),
    ).toEqual([
      ["user", "具体例は？"],
      ["llm", "例を追記しました"],
      ["user", "ありがとう"],
    ]);
    expect(finished).toMatchObject({
      event: "finished",
      threads: [{ id: first.id }],
    });
    expect(deps.stderr).toHaveBeenCalledWith(
      expect.stringContaining(`?entry=${review.entryId}`),
    );
  });

  test("--once は最初に届いた内容を読みやすい形で表示して終わる", async () => {
    const deps = dependencies();
    const running = runReviewCommand(
      [file, "--no-open", "--once", "--session", "s"],
      deps,
    );
    const review = await activeReview();
    const created = (await comment(review, "これなに？")).json<{
      id: string;
    }>();

    await expect(running).resolves.toBe(0);
    const output = deps.stdout.mock.calls.flat().join("\n");
    expect(output).toContain(`ユーザーのコメント: 計画 (${file})`);
    expect(output).toContain(`[thread ${created.id}]`);
    expect(output).toContain("- ユーザー: これなに？");
    expect(output).toContain(
      `返信: ${zattoCliCommand()} review reply <thread-id> "<本文>" --session s`,
    );
  });

  test("zatto が再起動しても再接続し、レビュー中に戻して待ち続ける", async () => {
    const deps = dependencies();
    const running = runReviewCommand(
      [file, "--no-open", "--session", "s"],
      deps,
    );
    await activeReview();
    const previousPort = port;
    await app.close();
    await vi.waitFor(() =>
      expect(deps.stderr).toHaveBeenCalledWith(
        "zatto サーバーとの接続が切れました。起動を待って再接続します",
      ),
    );
    await startServer(previousPort);

    const review = await activeReview();
    await comment(review, "再起動後のコメント");
    await vi.waitFor(() => expect(deps.stdout).toHaveBeenCalledTimes(1));
    expect(lines(deps.stdout)[0].threads[0].comments[0].body).toBe(
      "再起動後のコメント",
    );
    await rpc(app, "review.finish", { reviewId: review.id });
    await expect(running).resolves.toBe(0);
  });

  test("ほかのファイル・ほかのセッションへのコメントは出力しない", async () => {
    const deps = dependencies();
    const running = runReviewCommand(
      [file, "--no-open", "--session", "mine"],
      deps,
    );
    const review = await activeReview();
    const otherFile = path.join(dir, "other.md");
    await writeFile(otherFile, "# Other\n");
    const other = (
      await rpc(app, "session.add", {
        workspaceId: "default",
        paths: [otherFile],
      })
    ).json<{ resolved: Array<{ id: string }> }>().resolved[0]?.id;
    const otherReview = (
      await rpc(app, "review.start", {
        workspaceId: "default",
        entryId: other,
        session: "mine",
      })
    ).json<ActiveReview>();
    await comment(otherReview, "別のファイル");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(deps.stdout).not.toHaveBeenCalled();

    await comment(review, "このファイル");
    await vi.waitFor(() => expect(deps.stdout).toHaveBeenCalledTimes(1));
    expect(lines(deps.stdout)[0].threads[0].comments[0].body).toBe(
      "このファイル",
    );
    await rpc(app, "review.finish", { reviewId: review.id });
    await expect(running).resolves.toBe(0);
  });

  test("Web UI のタブがなければブラウザーで開く", async () => {
    let interrupt = () => {};
    const deps = dependencies((handler) => {
      interrupt = handler;
      return () => {};
    });
    const cli = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => cli.addEventListener("open", resolve));
    const running = runReviewCommand([file, "--session", "s"], deps);
    const review = await activeReview();
    await vi.waitFor(() =>
      expect(deps.openBrowser).toHaveBeenCalledWith(
        `http://127.0.0.1:${port}/?entry=${review.entryId}`,
      ),
    );
    interrupt();
    await expect(running).resolves.toBe(130);
    cli.close();
  });

  test("viewer.show を持たない版のサーバーではブラウザーで開く", async () => {
    let interrupt = () => {};
    const deps = {
      ...dependencies((handler) => {
        interrupt = handler;
        return () => {};
      }),
      fetch: (async (input, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (body.method === "viewer.show")
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32601, message: "Method not found" },
          });
        return globalThis.fetch(input, init);
      }) as typeof fetch,
    };
    const viewer = new WebSocket(`ws://127.0.0.1:${port}/ws?client=viewer`);
    await new Promise((resolve) => viewer.addEventListener("open", resolve));
    const running = runReviewCommand([file, "--session", "s"], deps);
    await activeReview();
    await vi.waitFor(() => expect(deps.openBrowser).toHaveBeenCalledOnce());
    interrupt();
    await expect(running).resolves.toBe(130);
    viewer.close();
  });

  test("Web UI のタブが開いていれば新しく開かず、そのタブにファイルを表示させる", async () => {
    let interrupt = () => {};
    const deps = dependencies((handler) => {
      interrupt = handler;
      return () => {};
    });
    const viewer = new WebSocket(`ws://127.0.0.1:${port}/ws?client=viewer`);
    const messages: unknown[] = [];
    viewer.addEventListener("message", (event) =>
      messages.push(JSON.parse(String(event.data))),
    );
    await new Promise((resolve) => viewer.addEventListener("open", resolve));
    const running = runReviewCommand([file, "--session", "s"], deps);
    const review = await activeReview();
    await vi.waitFor(() =>
      expect(messages).toContainEqual({
        type: "viewer:show",
        workspaceId: review.workspaceId,
        entryId: review.entryId,
      }),
    );
    interrupt();
    await expect(running).resolves.toBe(130);
    expect(deps.openBrowser).not.toHaveBeenCalled();
    viewer.close();
  });

  test("--brief はスレッド ID と最新のコメントの冒頭だけを 1 行で出す", async () => {
    const deps = dependencies();
    const running = runReviewCommand(
      [file, "--no-open", "--brief", "--session", "s"],
      deps,
    );
    const review = await activeReview();
    const long = `${"長い".repeat(100)}\n\n改行`;
    const created = (await comment(review, long)).json<{ id: string }>();
    await vi.waitFor(() => expect(deps.stdout).toHaveBeenCalledTimes(1));
    await rpc(app, "review.finish", { reviewId: review.id });
    await expect(running).resolves.toBe(0);

    const [first, finished] = lines(deps.stdout);
    expect(first).toEqual({
      event: "comment",
      file: "計画",
      threadId: created.id,
      comment: `${"長い".repeat(60)}…`,
      next: expect.stringContaining("get_review_thread"),
    });
    expect(finished).toMatchObject({
      event: "finished",
      file: "計画",
      openThreads: 1,
    });
    for (const call of deps.stdout.mock.calls)
      expect(String(call[0]).length).toBeLessThan(400);
  });

  test("中断すると 130 で終わる", async () => {
    let interrupt = () => {};
    const deps = dependencies((handler) => {
      interrupt = handler;
      return () => {};
    });
    const running = runReviewCommand(
      [file, "--no-open", "--session", "s"],
      deps,
    );
    await activeReview();
    interrupt();
    await expect(running).resolves.toBe(130);
  });

  test("引数を検証する", () => {
    expect(parseReviewArgs(["a.md", "--session", "s", "--once"])).toMatchObject(
      {
        mode: "file",
        file: path.resolve("a.md"),
        session: "s",
        once: true,
        open: true,
      },
    );
    expect(
      parseReviewArgs(["reply", "t1", "本文", "--session", "s"]),
    ).toMatchObject({ mode: "reply", threadId: "t1", body: "本文" });
    expect(
      parseReviewArgs([
        "reply",
        "t1",
        "本文",
        "--quote",
        "直した文",
        "--session",
        "s",
      ]),
    ).toMatchObject({ mode: "reply", quote: "直した文" });
    expect(() =>
      parseReviewArgs(["a.md", "--quote", "x", "--session", "s"]),
    ).toThrow("reply でだけ");
    expect(
      parseReviewArgs(["reply", "t1", "本文"], {
        CODEX_THREAD_ID: "019a2b3c-4d5e",
      }),
    ).toMatchObject({ session: "codex:019a2b3c", client: "codex" });
    expect(
      parseReviewArgs(["a.md", "--session", "s"], { CLAUDECODE: "1" }),
    ).toMatchObject({ session: "s", client: "claude" });
    expect(() => parseReviewArgs(["a.md"], {})).toThrow("省略できます");
    expect(() => parseReviewArgs(["a.md"])).toThrow("--session");
    expect(
      parseReviewArgs(["a.md", "--session", "s", "--brief"]),
    ).toMatchObject({ brief: true, once: false });
    expect(() =>
      parseReviewArgs(["a.md", "--session", "s", "--brief", "--once"]),
    ).toThrow("--brief と --once");
    expect(() => parseReviewArgs(["--session", "s"])).toThrow(
      "レビューするファイルを指定",
    );
    expect(() => parseReviewArgs(["a.md", "b.md", "--session", "s"])).toThrow(
      "1 つだけ",
    );
    expect(() =>
      parseReviewArgs(["a.md", "--inbox", "--session", "s"]),
    ).toThrow("不明なオプション");
    expect(() => parseReviewArgs(["reply", "t1", "--session", "s"])).toThrow(
      "スレッド ID と本文",
    );
    expect(() =>
      parseReviewArgs(["a.md", "--session", "s", "--port", "0"]),
    ).toThrow("--port");
  });
});
