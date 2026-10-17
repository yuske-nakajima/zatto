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
  let states: { reviews: unknown[]; listeners: unknown[] };

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
      listeners: [],
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

  test("レビュー中のファイルにラベルと送り先を表示し、レビューを終えられる", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");

    expect(
      (await screen.findByText("In review with zatto:a99c")).textContent,
    ).toBe("In review with zatto:a99c");
    expect(screen.getByText("In review").className).toBe("entry-review-label");
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "review.finish",
        params: { reviewId: "r1" },
      }),
    );
  });

  test("待機中のセッションを選んでレビューを始める", async () => {
    states = {
      reviews: [],
      listeners: [{ session: "zatto:inbox", lastSeenAt: Date.now() }],
    };
    render(<App />);
    await screen.findByTitle("Plan preview");

    fireEvent.click(
      await screen.findByRole("button", { name: "Start review" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /zatto:inbox/ }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "review.start",
        params: {
          workspaceId: "default",
          entryId: "plan",
          session: "zatto:inbox",
        },
      }),
    );
    expect(screen.queryByText("In review")).toBeNull();
  });

  test("待機中のセッションがなければ、待たせる方法を案内する", async () => {
    states = { reviews: [], listeners: [] };
    render(<App />);
    await screen.findByTitle("Plan preview");

    fireEvent.click(
      await screen.findByRole("button", { name: "Start review" }),
    );

    expect(
      screen.getByRole("menu", { name: "LLM sessions" }).textContent,
    ).toContain("No LLM session is waiting.");
  });
});
