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

  beforeEach(() => {
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
            if (method === "review.requests")
              return Response.json({
                requests: [
                  {
                    id: "r1",
                    entryId: "plan",
                    workspaceId: "default",
                    session: "zatto:a99c",
                    createdAt: 1,
                  },
                ],
              });
            if (method === "review.reply") return Response.json(thread);
            if (method === "review.complete")
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

  test("確認依頼を表示し、確認を終えると依頼を完了させる", async () => {
    render(<App />);
    await screen.findByTitle("Plan preview");

    expect(
      (await screen.findByText("Review requested by zatto:a99c")).textContent,
    ).toBe("Review requested by zatto:a99c");
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "review.complete",
        params: { requestId: "r1" },
      }),
    );
  });
});
