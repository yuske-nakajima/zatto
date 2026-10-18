import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentContextStore } from "../src/server/agent-context.js";
import { createApp } from "../src/server/app.js";
import { createCommands } from "../src/server/commands/index.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { ReviewStore } from "../src/server/review-store.js";
import { SessionStore } from "../src/server/session.js";
import { reviewAttachmentFileName } from "../src/shared/review.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-review-"));
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

const USER = { kind: "user" } as const;
const ANCHOR = { exact: "本文", prefix: "前の", suffix: "の後" };
/** 1x1 の透明な PNG */
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function fixture() {
  const store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
  const reviewPath = path.join(dir, "threads.json");
  const reviewStore = new ReviewStore(reviewPath);
  await reviewStore.load((id) => store.hasEntry(id));
  const hub = new RealtimeHub();
  const broadcast = vi.spyOn(hub, "broadcast");
  const commands = createCommands({
    sessionStore: store,
    agentContextStore: new AgentContextStore(),
    realtimeHub: hub,
    reviewStore,
    cliCommand: '"/opt/node" "/opt/zatto/bin/zatto.js"',
    logError: vi.fn(),
  });
  const file = path.join(dir, "plan.md");
  await writeFile(file, "# Plan\n\n本文\n");
  const [entry] = await store.addEntries([file]);
  return { store, reviewPath, commands, broadcast, entry };
}

describe("review threads", () => {
  test("スレッドの作成・返信・解決を保存し、再読込しても残る", async () => {
    const { store, reviewPath, commands, broadcast, entry } = await fixture();
    const thread = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: ANCHOR,
        author: USER,
        body: "  具体例は？  ",
      },
      [],
    );
    const replied = await commands.execute(
      "review.reply",
      {
        threadId: thread.id,
        author: { kind: "llm", session: "zatto:a99c" },
        body: "追記しました",
      },
      [],
    );
    await commands.execute(
      "review.resolve",
      { threadId: thread.id, resolved: true },
      [],
    );

    expect(replied.comments.map((comment) => comment.body)).toEqual([
      "具体例は？",
      "追記しました",
    ]);
    expect(broadcast).toHaveBeenCalledWith({
      type: "review:update",
      entryId: entry.id,
    });
    const restored = new ReviewStore(reviewPath);
    await restored.load((id) => store.hasEntry(id));
    expect(restored.list(entry.id)).toMatchObject([
      {
        id: thread.id,
        anchor: ANCHOR,
        resolved: true,
        comments: [
          { author: USER, body: "具体例は？" },
          { author: { kind: "llm", session: "zatto:a99c" } },
        ],
      },
    ]);
  });

  test("コメントの編集・削除の操作はなく、不明な対象は種類付きで拒否する", async () => {
    const { commands, entry } = await fixture();
    expect(commands.has("review.edit")).toBe(false);
    expect(commands.has("review.delete")).toBe(false);
    await expect(
      commands.execute(
        "review.reply",
        { threadId: "missing", author: USER, body: "x" },
        [],
      ),
    ).rejects.toMatchObject({ code: 1001, data: { kind: "notFound" } });
    await expect(
      commands.execute(
        "review.create",
        {
          workspaceId: "default",
          entryId: "missing",
          anchor: null,
          author: USER,
          body: "x",
        },
        [],
      ),
    ).rejects.toMatchObject({ code: 1001 });
    await expect(
      commands.execute(
        "review.create",
        {
          workspaceId: "default",
          entryId: entry.id,
          anchor: null,
          author: USER,
          body: "   ",
        },
        [],
      ),
    ).rejects.toMatchObject({ code: -32602 });
  });

  test("エントリを外すと、そのスレッドを保存ファイルから消す", async () => {
    const { reviewPath, commands, entry } = await fixture();
    await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: ANCHOR,
        author: USER,
        body: "消える",
      },
      [],
    );

    await commands.execute(
      "session.remove",
      { workspaceId: "default", id: entry.id },
      [],
    );

    expect(JSON.parse(await readFile(reviewPath, "utf8"))).toEqual({
      version: 1,
      threads: [],
    });
  });

  test("レビュー中のファイルへのユーザーのコメントだけを、送り先のセッションへ届ける", async () => {
    const { commands, broadcast, entry } = await fixture();
    await expect(commands.execute("review.states", {}, [])).resolves.toEqual({
      reviews: [],
      openThreadCounts: {},
      resolvedThreadCounts: {},
      deliveries: {},
      latestReplies: {},
    });
    const before = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: null,
        author: USER,
        body: "レビュー前",
      },
      [],
    );
    const review = await commands.execute(
      "review.start",
      { workspaceId: "default", entryId: entry.id, session: "zatto:a99c" },
      [],
    );
    await expect(
      commands.execute(
        "review.start",
        { workspaceId: "default", entryId: entry.id, session: "zatto:a99c" },
        [],
      ),
    ).resolves.toEqual(review);

    const thread = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: ANCHOR,
        author: USER,
        body: "具体例は？",
      },
      [],
    );
    await commands.execute(
      "review.reply",
      {
        threadId: thread.id,
        author: { kind: "llm", session: "zatto:a99c" },
        body: "LLM の返信は届けない",
      },
      [],
    );
    await commands.execute(
      "review.reply",
      { threadId: before.id, author: USER, body: "返信も届く" },
      [],
    );
    expect(broadcast).toHaveBeenCalledWith({
      type: "review:event",
      session: "zatto:a99c",
    });

    const base = {
      reviewId: review.id,
      entryId: entry.id,
      workspaceId: "default",
    };
    await expect(
      commands.execute("review.take", { session: "zatto:a99c" }, []),
    ).resolves.toEqual({
      events: [
        // レビュー前に書かれ、まだ答えていないスレッドも開始時に届く
        { kind: "comment", ...base, threadId: before.id },
        { kind: "comment", ...base, threadId: thread.id },
        { kind: "comment", ...base, threadId: before.id },
      ],
    });
    await expect(
      commands.execute("review.take", { session: "zatto:a99c" }, []),
    ).resolves.toEqual({ events: [] });

    await commands.execute("review.finish", { reviewId: review.id }, []);
    await expect(
      commands.execute("review.take", { session: "zatto:a99c" }, []),
    ).resolves.toEqual({ events: [{ kind: "finished", ...base }] });
    await expect(
      commands.execute("review.states", {}, []),
    ).resolves.toMatchObject({ reviews: [] });
    await expect(
      commands.execute("review.finish", { reviewId: review.id }, []),
    ).rejects.toMatchObject({ code: 1001 });

    await expect(commands.execute("review.states", {}, [])).resolves.toEqual({
      reviews: [],
      openThreadCounts: { [entry.id]: 2 },
      resolvedThreadCounts: {},
      deliveries: {},
      // 最新のコメントが LLM の返信で、解決していないスレッドだけを挙げる
      latestReplies: {
        [thread.id]: { entryId: entry.id, createdAt: expect.any(Number) },
      },
    });
    await commands.execute(
      "review.resolve",
      { threadId: before.id, resolved: true },
      [],
    );
    await expect(
      commands.execute("review.states", {}, []),
    ).resolves.toMatchObject({
      openThreadCounts: { [entry.id]: 1 },
      resolvedThreadCounts: { [entry.id]: 1 },
    });
    expect(broadcast).toHaveBeenCalledWith({
      type: "review:states",
      reviews: [],
      openThreadCounts: { [entry.id]: 1 },
      resolvedThreadCounts: { [entry.id]: 1 },
      deliveries: {},
      latestReplies: {
        [thread.id]: expect.objectContaining({ entryId: entry.id }),
      },
    });
  });

  test("ユーザーのコメントは、受け取られるまで未配信、受け取られたら配信済みになり、LLM の返信で消える", async () => {
    const { commands, entry } = await fixture();
    await commands.execute(
      "review.start",
      { workspaceId: "default", entryId: entry.id, session: "s" },
      [],
    );
    const thread = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: null,
        author: USER,
        body: "質問",
      },
      [],
    );
    const deliveryOf = async () =>
      (await commands.execute("review.states", {}, [])).deliveries[thread.id];

    await expect(deliveryOf()).resolves.toEqual({
      entryId: entry.id,
      status: "undelivered",
      since: expect.any(Number),
    });
    await commands.execute("review.take", { session: "s" }, []);
    await expect(deliveryOf()).resolves.toMatchObject({ status: "delivered" });
    await commands.execute(
      "review.reply",
      {
        threadId: thread.id,
        author: { kind: "llm", session: "s" },
        body: "答え",
      },
      [],
    );
    await expect(deliveryOf()).resolves.toBeUndefined();
  });

  test("コメントに添付した画像を保存し、検証に通らない画像は拒否し、エントリを外すと消す", async () => {
    const { store, commands, entry } = await fixture();
    const thread = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: null,
        author: USER,
        body: "この部分",
        attachments: [{ name: "shot.png", type: "image/png", data: PNG }],
      },
      [],
    );
    const attachment = thread.comments[0]?.attachments?.[0];
    expect(attachment).toMatchObject({ name: "shot.png", type: "image/png" });
    expect(path.dirname(attachment?.path ?? "")).toBe(
      path.join(dir, "review-attachments"),
    );
    expect(await readFile(attachment?.path ?? "")).toEqual(
      Buffer.from(PNG, "base64"),
    );

    const create = (attachments: unknown) =>
      commands.execute(
        "review.create",
        {
          workspaceId: "default",
          entryId: entry.id,
          anchor: null,
          author: USER,
          body: "x",
          attachments,
        } as never,
        [],
      );
    await expect(
      create([
        {
          name: "fake.png",
          type: "image/png",
          data: Buffer.from("not an image").toString("base64"),
        },
      ]),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      create(
        Array.from({ length: 5 }, () => ({
          name: "a.png",
          type: "image/png",
          data: PNG,
        })),
      ),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      create([{ name: "a.svg", type: "image/svg+xml", data: PNG }]),
    ).rejects.toMatchObject({ code: -32602 });

    await commands.execute(
      "session.remove",
      { workspaceId: "default", id: entry.id },
      [],
    );
    expect(store.hasEntry(entry.id)).toBe(false);
    await expect(access(attachment?.path ?? "")).rejects.toThrow();
  });

  test("ファイルを指定した受け取りは、そのファイルのイベントだけを取り出す", async () => {
    const { store, commands, entry } = await fixture();
    const otherFile = path.join(dir, "other.md");
    await writeFile(otherFile, "# Other\n");
    const [other] = await store.addEntries([otherFile]);
    for (const entryId of [entry.id, other.id]) {
      await commands.execute(
        "review.start",
        { workspaceId: "default", entryId, session: "s" },
        [],
      );
      await commands.execute(
        "review.create",
        {
          workspaceId: "default",
          entryId,
          anchor: null,
          author: USER,
          body: "x",
        },
        [],
      );
    }

    const mine = await commands.execute(
      "review.take",
      { session: "s", entryId: other.id },
      [],
    );
    expect(mine.events.map((event) => event.entryId)).toEqual([other.id]);
    const rest = await commands.execute("review.take", { session: "s" }, []);
    expect(rest.events.map((event) => event.entryId)).toEqual([entry.id]);
  });

  test("別のセッションを選ぶと、レビューの送り先が切り替わる", async () => {
    const { commands, entry } = await fixture();
    const first = await commands.execute(
      "review.start",
      { workspaceId: "default", entryId: entry.id, session: "a" },
      [],
    );
    const second = await commands.execute(
      "review.start",
      { workspaceId: "default", entryId: entry.id, session: "b" },
      [],
    );

    expect(second.id).not.toBe(first.id);
    await expect(
      commands.execute("review.states", {}, []),
    ).resolves.toMatchObject({ reviews: [{ id: second.id, session: "b" }] });
    await expect(
      commands.execute(
        "review.start",
        { workspaceId: "default", entryId: entry.id },
        [],
      ),
    ).rejects.toMatchObject({ code: -32602 });
  });

  test("添付画像は保存済みのコメントにあるものだけを配信する", async () => {
    const store = new SessionStore(path.join(dir, "session.json"));
    await store.load();
    const reviewStore = new ReviewStore(path.join(dir, "threads.json"));
    const file = path.join(dir, "plan.md");
    await writeFile(file, "# Plan\n");
    const [entry] = await store.addEntries([file]);
    const thread = await reviewStore.create(entry.id, null, USER, "x", [
      { name: "a.png", type: "image/png", data: PNG },
    ]);
    const attachment = thread.comments[0]?.attachments?.[0];
    if (!attachment) throw new Error("No attachment");
    const app = await createApp({ sessionStore: store, reviewStore });

    const found = await app.inject(
      `/review-attachments/${reviewAttachmentFileName(attachment)}`,
    );
    expect(found.statusCode).toBe(200);
    expect(found.headers["content-type"]).toBe("image/png");
    expect(found.rawPayload).toEqual(Buffer.from(PNG, "base64"));
    const missing = await app.inject("/review-attachments/other.png");
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  test("LLM への依頼文に、動いている zatto の CLI の絶対パスとファイルのパスを入れる", async () => {
    const { commands, entry } = await fixture();
    const { text } = await commands.execute(
      "review.request",
      { workspaceId: "default", entryId: entry.id },
      [],
    );

    expect(text).toContain(
      `"/opt/node" "/opt/zatto/bin/zatto.js" review ${JSON.stringify(entry.absPath)}\n`,
    );
    expect(text).toContain(
      '"/opt/node" "/opt/zatto/bin/zatto.js" review reply <thread-id>',
    );
    expect(text).toContain("tell me you are ready");
    expect(text).toContain("add --session <id> to both commands");
    expect(text).toContain("add --once");
    await expect(
      commands.execute(
        "review.request",
        { workspaceId: "default", entryId: "missing" },
        [],
      ),
    ).rejects.toMatchObject({ code: 1001 });
  });

  test("LLM の返信は、コメントした文章がファイルから消えていると差し戻し、--quote の文章へ付け直す", async () => {
    const { commands, entry } = await fixture();
    const LLM = { kind: "llm", session: "s" } as const;
    const thread = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: ANCHOR,
        author: USER,
        body: "言い換えて",
      },
      [],
    );
    await writeFile(
      entry.absPath,
      "# Plan\n\n**書き換えた**本文の説明です。\n\n説明と説明\n",
    );
    // 本文は書き換えた文の中に残っているため、差し戻さない
    await expect(
      commands.execute(
        "review.reply",
        { threadId: thread.id, author: LLM, body: "まだ残っています" },
        [],
      ),
    ).resolves.toMatchObject({ anchor: ANCHOR });
    await writeFile(
      entry.absPath,
      "# Plan\n\n**書き換えた**説明です。\n\n説明と説明\n",
    );

    const reply = (body: string, quote?: string) =>
      commands.execute(
        "review.reply",
        {
          threadId: thread.id,
          author: LLM,
          body,
          ...(quote === undefined ? {} : { quote }),
        },
        [],
      );
    await expect(reply("直しました")).rejects.toMatchObject({
      code: 1007,
      message: expect.stringContaining("--quote"),
    });
    await expect(reply("直しました", "存在しない文")).rejects.toMatchObject({
      code: 1007,
    });
    await expect(reply("直しました", "説明")).rejects.toMatchObject({
      code: 1007,
      message: expect.stringContaining("more than once"),
    });
    await expect(
      commands.execute(
        "review.reply",
        { threadId: thread.id, author: USER, body: "人の返信は通る" },
        [],
      ),
    ).resolves.toBeTruthy();

    const moved = await reply("直しました", "書き換えた説明です");
    expect(moved.anchor).toEqual({
      exact: "書き換えた説明です",
      prefix: "",
      suffix: "",
    });
    expect(moved.comments.at(-1)?.body).toBe("直しました");
  });

  test("レビューを始めると、まだ答えていないスレッドをまとめて送り、再接続では送り直さない", async () => {
    const { commands, entry } = await fixture();
    const create = (body: string) =>
      commands.execute(
        "review.create",
        {
          workspaceId: "default",
          entryId: entry.id,
          anchor: null,
          author: USER,
          body,
        },
        [],
      );
    const pending = await create("未回答");
    const answered = await create("回答済み");
    await commands.execute(
      "review.reply",
      {
        threadId: answered.id,
        author: { kind: "llm", session: "s" },
        body: "答え",
      },
      [],
    );
    const resolved = await create("解決済み");
    await commands.execute(
      "review.resolve",
      { threadId: resolved.id, resolved: true },
      [],
    );
    const start = () =>
      commands.execute(
        "review.start",
        { workspaceId: "default", entryId: entry.id, session: "s" },
        [],
      );
    const take = async () =>
      (await commands.execute("review.take", { session: "s" }, [])).events.map(
        (event) => (event.kind === "comment" ? event.threadId : event.kind),
      );

    await start();
    await start();
    expect(await take()).toEqual([pending.id]);
    await start();
    expect(await take()).toEqual([]);
  });

  test("同じセッションでつなぎ直したとき、クライアントが分かれば補う", async () => {
    const { commands, entry } = await fixture();
    const start = (client?: "claude") =>
      commands.execute(
        "review.start",
        {
          workspaceId: "default",
          entryId: entry.id,
          session: "s",
          ...(client ? { client } : {}),
        },
        [],
      );
    const first = await start();
    expect(first.client).toBeUndefined();
    const again = await start("claude");
    expect(again).toMatchObject({ id: first.id, client: "claude" });
  });
});
