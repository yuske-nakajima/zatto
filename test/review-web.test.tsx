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
import { formatCommentTime, ReviewStatus } from "../src/web/ReviewLayer.js";
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
      author: { kind: "llm", session: "zatto:a99c", client: "claude" },
      body: "例を**追記**しました\n\n- 1 点目\n\n<script>alert(1)</script>",
      createdAt: 2,
    },
  ],
};

let thread: ReviewThread = baseThread;
const REQUEST_TEXT = '"/bin/node" "/zatto/bin/zatto.js" review "/work/plan.md"';

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
      latestReplies: {},
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
            if (method === "review.request")
              return Response.json({ text: REQUEST_TEXT });
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

  test("返信の表と本文の中の画像を描画し、本文で描画した画像は下に重ねない", async () => {
    thread = {
      ...baseThread,
      comments: [
        baseThread.comments[0] as ReviewThread["comments"][number],
        {
          id: "c2",
          author: { kind: "llm", session: "zatto:a99c", client: "claude" },
          body: "| 項目 | 値 |\n|---|---|\n| 件数 | 3 |\n\n![構成図](attachment:1)",
          attachments: [
            {
              id: "a1",
              name: "diagram.png",
              type: "image/png",
              path: "/x/a1.png",
            },
            {
              id: "a2",
              name: "extra.png",
              type: "image/png",
              path: "/x/a2.png",
            },
          ],
          createdAt: 2,
        },
      ],
    };
    render(<App />);
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
    expect(dialog.querySelector(".review-markdown table td")?.textContent).toBe(
      "件数",
    );
    const sources = [...dialog.querySelectorAll("img")]
      .map((image) => image.getAttribute("src"))
      .filter((src) => src?.startsWith("/review-attachments/"));
    expect(sources).toEqual([
      "/review-attachments/a1.png",
      "/review-attachments/a2.png",
    ]);
    expect(
      dialog.querySelector(".review-markdown img")?.getAttribute("alt"),
    ).toBe("構成図");

    const inline = dialog.querySelector<HTMLElement>(".review-inline-image");
    inline?.focus();
    if (inline) fireEvent.click(inline);
    expect(screen.getByRole("dialog", { name: "diagram.png" })).toBeTruthy();
    fireEvent.keyDown(inline ?? dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "diagram.png" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Comment thread" })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Comment thread" })).toBeNull();
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
    expect(dialog.textContent).toContain("Claude · zatto:a99c");
    expect(
      [...dialog.querySelectorAll(".review-message")].map((item) => [
        item.className,
        item.querySelector("img")?.getAttribute("src"),
      ]),
    ).toEqual([
      ["review-message review-message--user", expect.stringContaining("user")],
      ["review-message review-message--llm", expect.stringContaining("claude")],
    ]);
    expect(dialog.querySelector("time")?.textContent).toBe(
      formatCommentTime(1),
    );
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
      latestReplies: {},
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
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(REQUEST_TEXT));
  });

  test("クリップボードが使えないときは、依頼文を表示する", async () => {
    states = {
      reviews: [],
      openThreadCounts: {},
      resolvedThreadCounts: {},
      deliveries: {},
      latestReplies: {},
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
    ).toBe(REQUEST_TEXT);
  });

  test("LLM が受け取るまでは未配信、受け取ったあとは返答中の表示を出す", async () => {
    thread = { ...baseThread, comments: baseThread.comments.slice(0, 1) };
    states = {
      ...states,
      deliveries: {
        t1: { entryId: "plan", status: "undelivered", since: Date.now() },
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

    expect(await screen.findByText("Not delivered yet")).toBeTruthy();
    cleanup();
    states = {
      ...states,
      deliveries: {
        t1: { entryId: "plan", status: "delivered", since: Date.now() },
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
    expect(
      await screen.findByRole("status", { name: "The LLM is replying" }),
    ).toBeTruthy();
    cleanup();
    states = {
      ...states,
      deliveries: {
        t1: {
          entryId: "plan",
          status: "delivered",
          since: Date.now() - 6 * 60 * 1000,
        },
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

  test("最大化したスレッドは Esc で元の大きさに戻り、次の Esc で閉じる。フォーカスが外にあっても効き、変換中は反応しない", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Maximize thread" }));
    expect(dialog.className).toContain("review-popover--maximized");
    expect(
      screen
        .getByRole("button", { name: "Restore thread size" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.keyDown(document.body, { key: "Escape", isComposing: true });
    expect(dialog.className).toContain("review-popover--maximized");

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(dialog.className).not.toContain("review-popover--maximized");
    expect(screen.getByRole("dialog", { name: "Comment thread" })).toBe(dialog);

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Comment thread" })).toBeNull();
  });

  test("ページ内検索が開いているときの Esc は、スレッドより先にページ内検索を閉じる", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comments, 1 open, 0 resolved",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    await screen.findByRole("dialog", { name: "Comment thread" });
    const frame = screen.getByTitle<HTMLIFrameElement>("Plan preview");
    const frameWindow = frame.contentWindow as
      | (Window & typeof globalThis)
      | null;
    for (const view of [window, frameWindow]) {
      if (!view) continue;
      view.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
      view.Range.prototype.getBoundingClientRect = () => new DOMRect();
      view.Element.prototype.scrollIntoView = () => undefined;
    }
    frame.contentDocument?.write("<p>閲覧URL を返す</p>");
    frame.contentDocument?.close();
    fireEvent.load(frame);
    (frame.contentDocument ?? document).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "f",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await screen.findByRole("search", { name: "Find in preview" });

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("search", { name: "Find in preview" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Comment thread" })).toBeTruthy();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Comment thread" })).toBeNull();

    // フォーカスがプレビューの本文にあるときの Esc は iframe の文書に届く
    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    await screen.findByRole("dialog", { name: "Comment thread" });
    const FrameKeyboardEvent = frameWindow?.KeyboardEvent ?? KeyboardEvent;
    frame.contentDocument?.body.dispatchEvent(
      new FrameKeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Comment thread" }),
      ).toBeNull(),
    );
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

  test("リンクで移った未登録のページでは、登録と戻る操作を出す", () => {
    const onRegister = vi.fn();
    const onBack = vi.fn();
    const review = { activeReview: null, requestText: null } as never;
    const { rerender } = render(
      <ReviewStatus
        review={review}
        linkedPage={{ absPath: "/work/sub/child.md", isViewable: true }}
        entryTitle="Plan"
        onRegisterLinkedPage={onRegister}
        onBack={onBack}
      />,
    );

    expect(screen.getByText("Not in zatto").getAttribute("title")).toBe(
      "/work/sub/child.md",
    );
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to Plan" }));
    expect(onRegister).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();

    rerender(
      <ReviewStatus
        review={review}
        linkedPage={{ absPath: "/work/sub/image.png", isViewable: false }}
        entryTitle="Plan"
        onRegisterLinkedPage={onRegister}
        onBack={onBack}
      />,
    );
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
  });

  test("日時は月/日と時:分で表し、コードブロックはボタンでコピーできる", async () => {
    expect(formatCommentTime(new Date(2026, 9, 18, 9, 5).getTime())).toBe(
      "10/18 09:05",
    );
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    thread = {
      ...baseThread,
      comments: [
        baseThread.comments[0],
        {
          id: "c3",
          author: { kind: "llm", session: "x" },
          body: "```sh\npnpm test\n```",
          createdAt: 3,
        },
      ] as ReviewThread["comments"],
    };
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

    expect(dialog.textContent).toContain("LLM · x");
    expect(
      dialog.querySelectorAll(".review-message img")[1]?.getAttribute("src"),
    ).toContain("llm");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("pnpm test"));
    expect(
      await within(dialog).findByRole("button", { name: "Copied" }),
    ).toBeTruthy();
  });

  test("Comments の一覧は最近動いた順に並び、開いていない返信に点を付け、開くと消す", async () => {
    localStorage.clear();
    const later = Date.now() + 60_000;
    const quiet: ReviewThread = {
      ...baseThread,
      id: "t0",
      anchor: { exact: "古いスレッド", prefix: "", suffix: "" },
      comments: [
        { id: "q1", author: { kind: "user" }, body: "古い", createdAt: 1 },
      ],
    };
    thread = {
      ...baseThread,
      comments: [
        baseThread.comments[0],
        {
          id: "c9",
          author: { kind: "llm", session: "s", client: "claude" },
          body: "新しい返信",
          createdAt: later,
        },
      ] as ReviewThread["comments"],
    };
    const threads = [quiet, thread];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        rpcFixture(
          async (method, init) => {
            const params = JSON.parse(String(init?.body));
            calls.push({ method: String(method), params });
            if (method === "session.get") return Response.json({ entries });
            if (method === "review.list") return Response.json({ threads });
            if (method === "review.states") return Response.json(states);
            if (method === "review.request")
              return Response.json({ text: REQUEST_TEXT });
            return new Response(null, { status: 204 });
          },
          { handleReview: true },
        ),
      ),
    );
    render(<App />);
    await screen.findByTitle("Plan preview");
    fireEvent.click(
      await screen.findByRole("button", { name: /^Comments, 2 open/ }),
    );

    const items = await screen.findAllByRole("button", { name: /comment/ });
    const quotes = items
      .map((item) => item.querySelector(".review-panel-quote")?.textContent)
      .filter(Boolean);
    expect(quotes[0]).toContain("閲覧URL");
    expect(quotes[1]).toContain("古いスレッド");
    expect(screen.getAllByRole("img", { name: "New reply" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /閲覧URL/ }));
    await screen.findByRole("dialog", { name: "Comment thread" });
    await waitFor(() =>
      expect(screen.queryByRole("img", { name: "New reply" })).toBeNull(),
    );
  });
});
