// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";

class FakeWebSocket extends EventTarget {
  static instance: FakeWebSocket | null = null;

  constructor(_url: string | URL) {
    super();
    FakeWebSocket.instance = this;
  }

  close(): void {
    this.dispatchEvent(new Event("close"));
  }

  emitMessage(message: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }
}

function entry(id: string, title: string): Entry {
  return {
    id,
    title,
    absPath: `/tmp/${id}.html`,
    addedAt: 1,
  };
}

describe("App", () => {
  const initialEntries = [entry("a", "Alpha"), entry("b", "Bravo")];

  beforeEach(() => {
    FakeWebSocket.instance = null;
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: initialEntries })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("先頭を自動選択し、クリックでビューを切り替える", async () => {
    const user = userEvent.setup();
    render(<App />);

    const firstFrame = await screen.findByTitle("Alpha のプレビュー");
    expect(firstFrame.getAttribute("src")).toBe("/f/a/");

    await user.click(screen.getByRole("button", { name: "Bravo を表示" }));
    expect(screen.getByTitle("Bravo のプレビュー").getAttribute("src")).toBe(
      "/f/b/",
    );
  });

  test("合流更新で選択を維持し、表示中の変更だけ再読込する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha のプレビュー");
    await user.click(screen.getByRole("button", { name: "Bravo を表示" }));

    const selectedFrame = screen.getByTitle("Bravo のプレビュー");
    act(() => {
      FakeWebSocket.instance?.emitMessage({
        type: "session:update",
        entries: [...initialEntries, entry("c", "Charlie")],
      });
    });
    expect(screen.getByTitle("Bravo のプレビュー")).toBe(selectedFrame);
    expect(screen.getByText("Charlie")).toBeTruthy();

    act(() => {
      FakeWebSocket.instance?.emitMessage({ type: "file:changed", id: "a" });
    });
    expect(screen.getByTitle("Bravo のプレビュー")).toBe(selectedFrame);

    act(() => {
      FakeWebSocket.instance?.emitMessage({ type: "file:changed", id: "b" });
    });
    expect(screen.getByTitle("Bravo のプレビュー")).not.toBe(selectedFrame);
  });

  test("個別削除と確認付き全削除をAPIへ送る", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByTitle("Alpha のプレビュー");

    await user.click(screen.getByRole("button", { name: "Alpha を削除" }));
    await user.click(screen.getByRole("button", { name: "全削除" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/session/a", {
      method: "DELETE",
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/session", {
      method: "DELETE",
    });
  });
});
