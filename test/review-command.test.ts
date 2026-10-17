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
import type { ActiveReview } from "../src/shared/review.js";
import { rpc } from "./rpc-server-helper.js";

let dir: string;
let app: FastifyInstance;
let runtimeFilePath: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-review-cli-"));
  const store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
  app = await createApp({
    sessionStore: store,
    serverIdentity: {
      instanceId: "review-server",
      protocolVersion: SERVER_PROTOCOL_VERSION,
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  runtimeFilePath = path.join(dir, "server.json");
  await writeServerRecord(runtimeFilePath, {
    instanceId: "review-server",
    pid: process.pid,
    port,
    protocolVersion: SERVER_PROTOCOL_VERSION,
  });
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

async function waitingSession(session: string): Promise<void> {
  await vi.waitFor(async () => {
    const { listeners } = (await rpc(app, "review.states", {})).json<{
      listeners: Array<{ session: string }>;
    }>();
    if (!listeners.some((listener) => listener.session === session))
      throw new Error("not yet");
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

describe("zatto review", () => {
  test("ファイルをレビュー中にし、コメントのたびと終了時に戻る", async () => {
    const first = dependencies();
    const firstRun = runReviewCommand(
      [file, "--no-open", "--session", "zatto:a99c"],
      first,
    );
    const review = await activeReview();
    expect(review.session).toBe("zatto:a99c");
    const created = (await comment(review, "具体例は？")).json<{
      id: string;
    }>();

    await expect(firstRun).resolves.toBe(0);
    const firstOutput = first.stdout.mock.calls.flat().join("\n");
    expect(firstOutput).toContain(`ユーザーのコメント: 計画 (${file})`);
    expect(firstOutput).toContain(`[thread ${created.id}]`);
    expect(firstOutput).toContain('対象の文章: "閲覧URL"');
    expect(firstOutput).toContain("- ユーザー: 具体例は？");
    expect(firstOutput).toContain(
      'zatto review reply <thread-id> "<本文>" --session zatto:a99c',
    );
    expect(first.stderr).toHaveBeenCalledWith(
      expect.stringContaining(`?entry=${review.entryId}`),
    );

    const reply = dependencies();
    await expect(
      runReviewCommand(
        ["reply", created.id, "例を追記しました", "--session", "zatto:a99c"],
        reply,
      ),
    ).resolves.toBe(0);

    await rpc(app, "review.reply", {
      threadId: created.id,
      author: { kind: "user" },
      body: "ありがとう、もう 1 つ",
    });
    const second = dependencies();
    const secondRun = runReviewCommand(
      [file, "--no-open", "--session", "zatto:a99c", "--json"],
      second,
    );
    await expect(secondRun).resolves.toBe(0);
    const report = JSON.parse(second.stdout.mock.calls[0]?.[0]);
    expect(report.reports[0].finished).toBe(false);
    expect(
      report.reports[0].threads[0].comments.map(
        (item: { author: { kind: string }; body: string }) => [
          item.author.kind,
          item.body,
        ],
      ),
    ).toEqual([
      ["user", "具体例は？"],
      ["llm", "例を追記しました"],
      ["user", "ありがとう、もう 1 つ"],
    ]);
    expect(second.openBrowser).not.toHaveBeenCalled();

    const third = dependencies();
    const thirdRun = runReviewCommand(
      [file, "--no-open", "--session", "zatto:a99c"],
      third,
    );
    await waitingSession("zatto:a99c");
    await rpc(app, "review.finish", { reviewId: review.id });
    await expect(thirdRun).resolves.toBe(0);
    const finished = third.stdout.mock.calls.flat().join("\n");
    expect(finished).toContain(
      `ユーザーがレビューを終えました: 計画 (${file})`,
    );
    expect(finished).toContain("未解決のスレッド: 1 件");
  });

  test("受付窓口として待ち、ユーザーが選んだファイルのコメントを受け取る", async () => {
    const inbox = dependencies();
    const inboxRun = runReviewCommand(
      ["--inbox", "--session", "zatto:inbox"],
      inbox,
    );
    await waitingSession("zatto:inbox");
    const added = await rpc(app, "session.add", {
      workspaceId: "default",
      paths: [file],
    });
    const entryId = added.json<{ resolved: Array<{ id: string }> }>()
      .resolved[0]?.id;
    const review = (
      await rpc(app, "review.start", {
        workspaceId: "default",
        entryId,
        session: "zatto:inbox",
      })
    ).json<ActiveReview>();
    expect(inbox.stdout).not.toHaveBeenCalled();
    await comment(review, "これなに？");

    await expect(inboxRun).resolves.toBe(0);
    expect(inbox.stdout.mock.calls.flat().join("\n")).toContain(
      "- ユーザー: これなに？",
    );
    expect(inbox.openBrowser).not.toHaveBeenCalled();
  });

  test("ほかのセッションへのコメントでは戻らない", async () => {
    const mine = dependencies();
    const mineRun = runReviewCommand(["--inbox", "--session", "mine"], mine);
    const other = dependencies();
    const otherRun = runReviewCommand(
      [file, "--no-open", "--session", "other"],
      other,
    );
    const review = await activeReview();
    await waitingSession("mine");
    await comment(review, "other へ");

    await expect(otherRun).resolves.toBe(0);
    expect(mine.stdout).not.toHaveBeenCalled();
    await rpc(app, "review.start", {
      workspaceId: review.workspaceId,
      entryId: review.entryId,
      session: "mine",
    });
    await comment(review, "mine へ");
    await expect(mineRun).resolves.toBe(0);
  });

  test("中断すると待機をやめ、サーバーの停止ではエラーで終わる", async () => {
    let interrupt = () => {};
    const cancelled = dependencies((handler) => {
      interrupt = handler;
      return () => {};
    });
    const cancelledRun = runReviewCommand(
      ["--inbox", "--session", "stop-me"],
      cancelled,
    );
    await waitingSession("stop-me");
    interrupt();
    await expect(cancelledRun).resolves.toBe(130);
    expect(
      (await rpc(app, "review.states", {})).json<{ listeners: unknown[] }>()
        .listeners,
    ).toEqual([]);

    const stopped = dependencies();
    const stoppedRun = runReviewCommand(
      ["--inbox", "--session", "server-stops"],
      stopped,
    );
    await waitingSession("server-stops");
    await app.close();
    await expect(stoppedRun).resolves.toBe(1);
    expect(stopped.stderr).toHaveBeenCalledWith(
      "待っている間に zatto サーバーが停止しました",
    );
  });

  test("引数を検証する", () => {
    expect(parseReviewArgs(["a.md", "--session", "s", "--json"])).toMatchObject(
      {
        mode: "file",
        file: path.resolve("a.md"),
        session: "s",
        json: true,
        open: true,
      },
    );
    expect(parseReviewArgs(["--inbox", "--session", "s"])).toMatchObject({
      mode: "inbox",
    });
    expect(
      parseReviewArgs(["reply", "t1", "本文", "--session", "s"]),
    ).toMatchObject({ mode: "reply", threadId: "t1", body: "本文" });
    expect(() => parseReviewArgs(["a.md"])).toThrow("--session");
    expect(() => parseReviewArgs(["--session", "s"])).toThrow(
      "レビューするファイルを指定",
    );
    expect(() => parseReviewArgs(["a.md", "b.md", "--session", "s"])).toThrow(
      "1 つだけ",
    );
    expect(() =>
      parseReviewArgs(["--inbox", "a.md", "--session", "s"]),
    ).toThrow("--inbox ではファイル");
    expect(() => parseReviewArgs(["reply", "t1", "--session", "s"])).toThrow(
      "スレッド ID と本文",
    );
    expect(() =>
      parseReviewArgs(["a.md", "--session", "s", "--port", "0"]),
    ).toThrow("--port");
  });
});
