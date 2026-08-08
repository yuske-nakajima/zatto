// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import type { SearchResponse } from "../src/shared/search.js";
import { App } from "../src/web/App.js";

class FakeWebSocket extends EventTarget {
  static instance: FakeWebSocket | null = null;

  constructor() {
    super();
    FakeWebSocket.instance = this;
  }

  close(): void {
    this.dispatchEvent(new Event("close"));
  }

  emit(message: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }
}

const entries: Entry[] = [
  { id: "a", title: "First title", absPath: "/work/first.html", addedAt: 1 },
  { id: "b", title: "Second title", absPath: "/work/second.html", addedAt: 2 },
];

const result: SearchResponse = {
  query: "alpha",
  totalMatches: 2,
  truncated: false,
  files: [
    {
      entryId: "a",
      title: "First title",
      fileName: "first.html",
      absPath: "/work/first.html",
      matchCount: 2,
      truncated: false,
      lines: [
        {
          lineNumber: 2,
          startOffset: 0,
          lineText: "<p>alpha alpha</p>",
          truncated: false,
          ranges: [
            { start: 3, length: 5 },
            { start: 9, length: 5 },
          ],
        },
      ],
    },
  ],
};

describe("HTML search behavior", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    FakeWebSocket.instance = null;
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("iframeを維持しながらfocusと検索状態を往復する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session"
          ? Response.json({ entries })
          : Response.json({ ...result, truncated: true }),
      ),
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const preview = screen.getByTitle("First title preview");
    const searchButton = screen.getByRole("button", { name: "Search" });

    fireEvent.click(searchButton);
    const input = screen.getByRole("searchbox", { name: "Search HTML files" });
    const liveStatus = screen.getByRole("status", { name: "Search status" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(liveStatus.textContent).toBe("Searching HTML files.");
    await act(async () => vi.advanceTimersByTimeAsync(250));

    expect(liveStatus.textContent).toBe("2 matches in 1 file.");
    expect(screen.getByText("2 matches in 1 file")).toBeTruthy();
    expect(
      screen.getByText("Results are limited. More matches may exist."),
    ).toBeTruthy();
    expect(screen.getAllByText("first.html")).toHaveLength(2);
    expect(screen.getByText("2 matches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide file panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));

    expect(screen.getByTitle("First title preview")).toBe(preview);
    const viewerPanelButton = screen.getByRole("button", {
      name: "Show file panel",
    });
    expect(document.activeElement).toBe(viewerPanelButton);
    fireEvent.click(viewerPanelButton);
    const returnButton = screen.getByRole("button", {
      name: "Back to search results",
    });
    fireEvent.click(returnButton);
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getByRole("button", { name: "Hide file panel" }));
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Show file panel" }),
    );
  });

  test("sessionとfile更新で再検索し、削除済み結果を開かない", async () => {
    let searchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        if (input === "/api/session") {
          return Response.json({ entries });
        }
        searchCalls += 1;
        return Response.json(
          searchCalls === 1
            ? result
            : { query: "alpha", totalMatches: 0, truncated: false, files: [] },
        );
      }),
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search HTML files" }),
      { target: { value: "alpha" } },
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));

    act(() => {
      FakeWebSocket.instance?.emit({
        type: "session:update",
        entries: [entries[1]],
      });
    });
    const urlAfterRemoval = window.location.href;
    fireEvent.click(
      screen.getByRole("button", { name: "Open first.html at line 2" }),
    );
    expect(
      screen.getByRole("searchbox", { name: "Search HTML files" }),
    ).toBeTruthy();
    expect(window.location.href).toBe(urlAfterRemoval);
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByText("No results")).toBeTruthy();

    act(() => {
      FakeWebSocket.instance?.emit({ type: "file:changed", id: "b" });
    });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(searchCalls).toBe(3);
  });

  test("検索アニメーションを動きの抑制設定で停止する", () => {
    const css = readFileSync("src/web/search-results.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/animation:\s*none/);
  });
});
