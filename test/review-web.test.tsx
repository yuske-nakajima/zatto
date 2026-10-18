// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import type { ReviewStates, ReviewThread } from "../src/shared/review.js";
import { App } from "../src/web/App.js";
import { reviewRequestText } from "../src/web/ReviewLayer.js";
import { rpcFixture } from "./rpc-client-fixture.js";

const entries: Entry[] = [
  { id: "plan", title: "Plan", absPath: "/work/plan.md", addedAt: 1 },
];

const baseThread: ReviewThread = {
  id: "t1",
  entryId: "plan",
  anchor: { exact: "閲覧URL", prefix: "", suffix: "" },
  resolved: false,
  createdAt: 1,
  comments: [
    { id: "c1", author: { kind: "user" }, body: "具体例は？", createdAt: 1 },
    {
      id: "c2",
      author: { kind: "llm", session: "zatto:a99c" },
      body: "例を**追記**しました\n\n- 1 点目\n\n<script>alert(1)</script>",
      createdAt: 2,
    },
  ],
};

let thread: ReviewThread = baseThread;

class FakeWebSocket extends EventTarget {
  close(): void {}
}

describe("レビューのコメント", () => {
  let calls: Array<{ method: string; params: Record<string, unknown> }>;
  let states: ReviewStates;

  beforeEach(() => {
    thread = baseThread;
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:${Math.random()}`),
        revokeObjectURL: vi.fn(),
      }),
    );
    states = {
      reviews: [
        {
          id: "r1",
          entryId: "plan",
          workspaceId: "default",
          session: "zatto:a99c",
          createdAt: 1,
        },
      ],
      openThreadCounts: { plan: 1 },
      resolvedThreadCounts: {},
      deliveries: {},
    };
    window.history.replaceState(null, "", "/?entry=plan");
    vi.stubGlobal("WebSocket", FakeWebSocket);
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        rpcFixture(
          async (method, init) => {
            const params = JSON.parse(String(init?.body));
            calls.push({ method: String(method), params });
            if (method === "session.get") return Response.json({ entries });
            if (method === "review.list")
              return Response.json({ threads: [thread] });
            if (method === "review.states") return Response.json(states);
            if (method === "review.start")
              return Response.json({
                id: "r2",
                entryId: "plan",
                workspaceId: "default",
                session: String(params.session),
                createdAt: 2,
              });
            if (method === "review.reply" || method === "review.create")
              return Response.json(thread);
            if (method === "review.finish")
              return new Response(null, { status: 204 });
            return new Response(null, { status: 204 });
          },
          { handleReview: true },
        ),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("一覧からスレッドを開き、作成者を表示して返信できる", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /閲覧URL.*具体例は？.*2 comments/ }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Comment thread",
    });
    expect(dialog.textContent).toContain("You");
    expect(dialog.textContent).toContain("LLM · zatto:a99c");
    expect(dialog.textContent).not.toContain("Open");
    expect(dialog.querySelector("strong")?.textContent).toBe("追記");
    expect(
      dialog.querySelector("li li, .review-markdown li")?.textContent,
    ).toBe("1 点目");
    expect(dialog.querySelector("script")).toBeNull();
    expect(dialog.textContent).toContain("<script>alert(1)</script>");
    expect(within(dialog).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: "✓ Resolve" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reply"), {
      target: { value: "ありがとう" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "review.reply",
        params: {
          threadId: "t1",
          author: { kind: "user" },
          body: "ありがとう",
        },
      }),
    );
  });

  test("レビュー中のファイルにスレッド数とラベルを表示し、レビューを終えられる", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");

    expect(
      (await screen.findByText("In review with zatto:a99c")).textContent,
    ).toBe("In review with zatto:a99c");
    const label = document.querySelector(".entry-review-label");
    expect(label?.querySelector(".review-count--open")?.textContent).toBe(
      "1 open",
    );
    expect(label?.querySelector(".review-count--resolved")).toBeNull();
    expect(label?.textContent).toContain("In review");
    expect(label?.classList.contains("entry-review-label--active")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "review.finish",
        params: { reviewId: "r1" },
      }),
    );
  });

  test("レビュー中でないファイルは、LLM に貼る依頼文をコピーできる", async () => {
    states = {
      reviews: [],
      openThreadCounts: { plan: 2 },
      resolvedThreadCounts: { plan: 3 },
      deliveries: {},
    };
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);
    await screen.findByTitle("Plan preview");

    const label = await screen.findByText(
      (_, element) =>
        element?.classList.contains("entry-review-label") ?? false,
    );
    expect(label.textContent).toBe("2 open3 resolved");
    fireEvent.click(
      screen.getByRole("button", { name: "Ask an LLM to review" }),
    );

    await screen.findByRole("button", {
      name: "Copied — paste it into an LLM",
    });
    expect(writeText).toHaveBeenCalledWith(reviewRequestText("/work/plan.md"));
    expect(reviewRequestText("/work/plan.md")).toContain(
      'zatto review "/work/plan.md" --session <id>',
    );
  });

  test("クリップボードが使えないときは、依頼文を表示する", async () => {
    states = {
      reviews: [],
      openThreadCounts: {},
      resolvedThreadCounts: {},
      deliveries: {},
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    render(<App />);
    await screen.findByTitle("Plan preview");

    fireEvent.click(
      await screen.findByRole("button", { name: "Ask an LLM to review" }),
    );

    expect(
      (
        (await screen.findByLabelText(
          "Request for an LLM",
        )) as HTMLTextAreaElement
      ).value,
    ).toBe(reviewRequestText("/work/plan.md"));
  });

  test("LLM が受け取るまでは未配信、受け取ったあとは返答中の表示を出す", async () => {
    thread = { ...baseThread, comments: baseThread.comments.slice(0, 1) };
    states = {
      ...states,
      deliveries: { t1: { status: "undelivered", since: Date.now() } },
    };
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));

    expect(await screen.findByText("Not delivered yet")).toBeTruthy();
    cleanup();
    states = {
      ...states,
      deliveries: { t1: { status: "delivered", since: Date.now() } },
    };
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    expect(
      await screen.findByRole("status", { name: "The LLM is replying" }),
    ).toBeTruthy();
    cleanup();
    states = {
      ...states,
      deliveries: {
        t1: { status: "delivered", since: Date.now() - 6 * 60 * 1000 },
      },
    };
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    await screen.findByRole("dialog", { name: "Comment thread" });
    expect(
      screen.queryByRole("status", { name: "The LLM is replying" }),
    ).toBeNull();
  });

  test("返信に画像を貼り付け、送信前に外せ、送信すると base64 で送る", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    const reply = await screen.findByLabelText("Reply");
    const image = () =>
      new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

    fireEvent.paste(reply, { clipboardData: { files: [image()] } });
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove shot.png" }),
    );
    expect(
      screen.queryByRole("button", { name: "Remove shot.png" }),
    ).toBeNull();
    fireEvent.paste(reply, {
      clipboardData: {
        files: [new File(["x"], "a.svg", { type: "image/svg+xml" })],
      },
    });
    expect(
      await screen.findByText(
        "Only PNG, JPEG, WebP, and GIF images can be attached.",
      ),
    ).toBeTruthy();
    fireEvent.paste(reply, { clipboardData: { files: [image()] } });
    fireEvent.change(reply, { target: { value: "ここ" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "review.reply",
        params: {
          threadId: "t1",
          author: { kind: "user" },
          body: "ここ",
          attachments: [{ name: "shot.png", type: "image/png", data: "AQID" }],
        },
      }),
    );
  });

  test("Esc と × でポップアップを閉じる", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Comment thread",
    });

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Comment thread" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Comment thread" })).toBeNull();
  });

  test("コメントを送ると、閉じずに作ったスレッドを開く", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Comment on document" }),
    );
    fireEvent.change(await screen.findByLabelText("Comment"), {
      target: { value: "全体について" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(
      await screen.findByRole("dialog", { name: "Comment thread" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "New comment" })).toBeNull();
  });
});
