import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentContextStore } from "../src/server/agent-context.js";
import { createCommands } from "../src/server/commands/index.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { ReviewStore } from "../src/server/review-store.js";
import { SessionStore } from "../src/server/session.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-review-"));
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

const USER = { kind: "user" } as const;
const ANCHOR = { exact: "本文", prefix: "前の", suffix: "の後" };

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
    logError: vi.fn(),
  });
  const file = path.join(dir, "plan.md");
  await writeFile(file, "# Plan\n\n本文\n");
  const [entry] = await store.addEntries([file]);
  return { store, reviewPath, commands, broadcast, entry };
}

describe("review threads", () => {
  test("スレッドの作成・返信・編集・解決を保存し、再読込しても残る", async () => {
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
    const firstId = thread.comments[0]?.id ?? "";
    await commands.execute(
      "review.edit",
      { threadId: thread.id, commentId: firstId, body: "例を 1 つ" },
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
          { author: USER, body: "例を 1 つ", updatedAt: expect.any(Number) },
          { author: { kind: "llm", session: "zatto:a99c" } },
        ],
      },
    ]);
  });

  test("最後のコメントを消すとスレッドも消え、不明な対象は種類付きで拒否する", async () => {
    const { commands, entry } = await fixture();
    const thread = await commands.execute(
      "review.create",
      {
        workspaceId: "default",
        entryId: entry.id,
        anchor: null,
        author: USER,
        body: "全体について",
      },
      [],
    );
    await expect(
      commands.execute(
        "review.delete",
        { threadId: thread.id, commentId: thread.comments[0]?.id ?? "" },
        [],
      ),
    ).resolves.toBeNull();
    await expect(
      commands.execute(
        "review.list",
        { workspaceId: "default", entryId: entry.id },
        [],
      ),
    ).resolves.toEqual({ threads: [] });
    await expect(
      commands.execute(
        "review.reply",
        { threadId: thread.id, author: USER, body: "x" },
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
    });
    await commands.execute(
      "review.resolve",
      { threadId: before.id, resolved: true },
      [],
    );
    await expect(
      commands.execute("review.states", {}, []),
    ).resolves.toMatchObject({ openThreadCounts: { [entry.id]: 1 } });
    expect(broadcast).toHaveBeenCalledWith({
      type: "review:states",
      reviews: [],
      openThreadCounts: { [entry.id]: 1 },
    });
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
});
