// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import type { ReviewThread } from "../src/shared/review.js";
import { App } from "../src/web/App.js";
import { reviewRequestText } from "../src/web/ReviewLayer.js";
import { rpcFixture } from "./rpc-client-fixture.js";

const entries: Entry[] = [
  { id: "plan", title: "Plan", absPath: "/work/plan.md", addedAt: 1 },
];

const thread: ReviewThread = {
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
      body: "例を追記しました",
      createdAt: 2,
    },
  ],
};

class FakeWebSocket extends EventTarget {
  close(): void {}
}

describe("レビューのコメント", () => {
  let calls: Array<{ method: string; params: Record<string, unknown> }>;
  let states: { reviews: unknown[]; openThreadCounts: Record<string, number> };

  beforeEach(() => {
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
            if (method === "review.reply") return Response.json(thread);
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

    fireEvent.click(await screen.findByRole("button", { name: "Comments 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: /閲覧URL.*具体例は？.*2 comments/ }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Comment thread",
    });
    expect(dialog.textContent).toContain("You");
    expect(dialog.textContent).toContain("LLM · zatto:a99c");
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
    expect(label?.textContent).toBe("1 · In review");
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
    states = { reviews: [], openThreadCounts: { plan: 2 } };
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);
    await screen.findByTitle("Plan preview");

    expect(
      (
        await screen.findByText(
          (_, element) =>
            element?.classList.contains("entry-review-label") ?? false,
        )
      ).textContent,
    ).toBe("2");
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
    states = { reviews: [], openThreadCounts: {} };
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
});
