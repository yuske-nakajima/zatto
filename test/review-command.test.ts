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
import type { ReviewRequest } from "../src/shared/review.js";
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

async function pendingRequest(): Promise<ReviewRequest> {
  return vi.waitFor(async () => {
    const [request] = (await rpc(app, "review.requests", {})).json<{
      requests: ReviewRequest[];
    }>().requests;
    if (!request) throw new Error("not yet");
    return request;
  });
}

describe("zatto review", () => {
  test("確認を依頼して待ち、確認が終わると未解決のスレッドを返す", async () => {
    const deps = dependencies();
    const running = runReviewCommand(
      [file, "--no-open", "--session", "zatto:a99c"],
      deps,
    );

    const request = await pendingRequest();
    expect(request.session).toBe("zatto:a99c");
    for (const body of ["具体例は？", "解決済み"])
      await rpc(app, "review.create", {
        workspaceId: request.workspaceId,
        entryId: request.entryId,
        anchor: { exact: "閲覧URL", prefix: "", suffix: " を返す" },
        author: { kind: "user" },
        body,
      });
    const { threads } = (
      await rpc(app, "review.list", {
        workspaceId: request.workspaceId,
        entryId: request.entryId,
      })
    ).json<{ threads: Array<{ id: string }> }>();
    await rpc(app, "review.resolve", {
      threadId: threads[1]?.id,
      resolved: true,
    });
    expect(
      (await rpc(app, "review.complete", { requestId: request.id })).code,
    ).toBe(0);

    await expect(running).resolves.toBe(0);
    const output = deps.stdout.mock.calls.flat().join("\n");
    expect(output).toContain(`確認が終わりました: 計画 (${file})`);
    expect(output).toContain("未解決のスレッド: 1 件");
    expect(output).toContain(`[thread ${threads[0]?.id}]`);
    expect(output).toContain('対象の文章: "閲覧URL"');
    expect(output).toContain("- ユーザー: 具体例は？");
    expect(output).not.toContain("解決済み");
    expect(deps.stderr).toHaveBeenCalledWith(
      expect.stringContaining(`?entry=${request.entryId}`),
    );
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });

  test("ほかの依頼の完了では終わらず、自分の依頼だけを待つ", async () => {
    const first = dependencies();
    const second = dependencies();
    const firstRun = runReviewCommand([file, "--no-open", "--json"], first);
    const firstRequest = await pendingRequest();
    const secondRun = runReviewCommand([file, "--no-open"], second);
    const secondRequest = await vi.waitFor(async () => {
      const { requests } = (await rpc(app, "review.requests", {})).json<{
        requests: ReviewRequest[];
      }>();
      const other = requests.find(({ id }) => id !== firstRequest.id);
      if (!other) throw new Error("not yet");
      return other;
    });

    await rpc(app, "review.complete", { requestId: secondRequest.id });
    await expect(secondRun).resolves.toBe(0);
    expect(first.stdout).not.toHaveBeenCalled();

    await rpc(app, "review.complete", { requestId: firstRequest.id });
    await expect(firstRun).resolves.toBe(0);
    expect(JSON.parse(first.stdout.mock.calls[0]?.[0])).toMatchObject({
      entry: { path: file, title: "計画" },
      threads: [],
    });
  });

  test("中断すると依頼を取り消し、サーバーの停止ではエラーで終わる", async () => {
    let interrupt = () => {};
    const cancelled = dependencies((handler) => {
      interrupt = handler;
      return () => {};
    });
    const cancelledRun = runReviewCommand([file, "--no-open"], cancelled);
    await pendingRequest();
    interrupt();
    await expect(cancelledRun).resolves.toBe(130);
    expect(
      (await rpc(app, "review.requests", {})).json<{ requests: unknown[] }>()
        .requests,
    ).toEqual([]);

    const stopped = dependencies();
    const stoppedRun = runReviewCommand([file, "--no-open"], stopped);
    await pendingRequest();
    await app.close();
    await expect(stoppedRun).resolves.toBe(1);
    expect(stopped.stderr).toHaveBeenCalledWith(
      "確認の完了を待つ間に zatto サーバーが停止しました",
    );
  });

  test("引数を検証する", () => {
    expect(parseReviewArgs(["a.md", "--session", "s", "--json"])).toMatchObject(
      {
        file: path.resolve("a.md"),
        session: "s",
        json: true,
        open: true,
      },
    );
    expect(() => parseReviewArgs([])).toThrow("確認するファイルを指定");
    expect(() => parseReviewArgs(["a.md", "b.md"])).toThrow("1 つだけ");
    expect(() => parseReviewArgs(["a.md", "--session"])).toThrow("値を指定");
    expect(() => parseReviewArgs(["a.md", "--port", "0"])).toThrow("--port");
  });
});
