// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { ReviewStatusBar } from "../src/web/ReviewStatusBar.js";
import { blockRange } from "../src/web/review-anchor.js";
import type { ReviewThreads } from "../src/web/useReviewThreads.js";

const entries: Entry[] = [
  { id: "plan", title: "Plan", absPath: "/work/plan.md", addedAt: 1 },
];

function review(overrides: Partial<ReviewThreads>): ReviewThreads {
  return {
    reviews: [],
    deliveries: {},
    latestReplies: {},
    ...overrides,
  } as ReviewThreads;
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

test("返答中・新しい返信・レビュー中のファイル数の順に、いまの状態を 1 つ出す", () => {
  const onOpen = vi.fn();
  const onOpenComments = vi.fn();
  const reviews = [
    {
      id: "r1",
      entryId: "plan",
      workspaceId: "default",
      session: "s",
      client: "claude" as const,
      createdAt: 1,
    },
  ];
  const { rerender } = render(
    <ReviewStatusBar
      review={review({
        reviews,
        deliveries: {
          t1: { entryId: "plan", status: "delivered", since: Date.now() },
        },
      })}
      entries={entries}
      onOpen={onOpen}
      onOpenComments={onOpenComments}
    />,
  );
  expect(screen.getByRole("status").textContent).toBe("Claude is thinking");

  rerender(
    <ReviewStatusBar
      review={review({
        reviews,
        latestReplies: {
          plan: {
            threadId: "t1",
            createdAt: Date.now() + 1000,
            client: "codex",
          },
        },
      })}
      entries={entries}
      onOpen={onOpen}
      onOpenComments={onOpenComments}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Codex replied · Plan ›" }),
  );
  expect(onOpen).toHaveBeenCalledWith("plan", "t1");

  rerender(
    <ReviewStatusBar
      review={review({ reviews })}
      entries={entries}
      onOpen={onOpen}
      onOpenComments={onOpenComments}
    />,
  );
  expect(screen.getByText("Reviewing 1 file")).toBeTruthy();
});

test("ブロック全体を指す範囲は、文字の上限で切る", () => {
  document.body.innerHTML = `<p id="short">短い段落</p><p id="long">${"あ".repeat(2500)}</p><p id="empty"> </p>`;
  const short = document.getElementById("short");
  const long = document.getElementById("long");
  const empty = document.getElementById("empty");
  if (!short || !long || !empty) throw new Error("No blocks");

  expect(blockRange(document, short)?.toString()).toBe("短い段落");
  expect(blockRange(document, long)?.toString()).toHaveLength(2000);
  expect(blockRange(document, empty)).toBeNull();
});

test("未読の返信が複数あるときは件数を添え、重ねると一覧を出して、選ぶとそのファイルの Comments を開く", () => {
  const onOpenComments = vi.fn();
  const now = Date.now();
  render(
    <ReviewStatusBar
      review={review({
        latestReplies: {
          plan: { threadId: "t1", createdAt: now + 2000, client: "claude" },
          notes: { threadId: "t2", createdAt: now + 1000 },
        },
      })}
      entries={[
        ...entries,
        { id: "notes", title: "Notes", absPath: "/work/notes.md", addedAt: 2 },
      ]}
      onOpen={vi.fn()}
      onOpenComments={onOpenComments}
    />,
  );
  const status = screen.getByRole("button", { name: /Claude replied · Plan/ });
  expect(status.textContent).toContain("+1");

  fireEvent.mouseEnter(status.parentElement as HTMLElement);
  const list = screen.getByRole("list", { name: "Files with new replies" });
  expect(list.textContent).toContain("Plan");
  expect(list.textContent).toContain("Notes");
  fireEvent.click(screen.getByRole("button", { name: /^Notes/ }));
  expect(onOpenComments).toHaveBeenCalledWith("notes");
});
