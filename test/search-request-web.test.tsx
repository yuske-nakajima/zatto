// @vitest-environment jsdom

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
  close(): void {
    this.dispatchEvent(new Event("close"));
  }
}

const entries: Entry[] = [
  { id: "a", title: "First", absPath: "/work/first.html", addedAt: 1 },
];

const alphaResult: SearchResponse = {
  query: "alpha",
  totalMatches: 1,
  truncated: false,
  files: [
    {
      entryId: "a",
      title: "First",
      fileName: "first.html",
      absPath: "/work/first.html",
      matchCount: 1,
      truncated: false,
      lines: [
        {
          lineNumber: 1,
          startOffset: 0,
          lineText: "alpha",
          truncated: false,
          ranges: [{ start: 0, length: 5 }],
        },
      ],
    },
  ],
};

describe("HTML search requests", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("入力変更で古いリクエストを中断し、遅い応答を無視する", async () => {
    let resolveFirstSearch: ((response: Response) => void) | undefined;
    const firstSearch = new Promise<Response>((resolve) => {
      resolveFirstSearch = resolve;
    });
    let firstSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (input === "/api/session") {
          return Promise.resolve(Response.json({ entries }));
        }
        if (String(input).includes("alpha")) {
          firstSignal = init?.signal ?? undefined;
          return firstSearch;
        }
        return Promise.resolve(
          Response.json({
            query: "beta",
            totalMatches: 0,
            truncated: false,
            files: [],
          }),
        );
      }),
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByRole("searchbox", { name: "Search HTML files" });
    fireEvent.change(input, { target: { value: "alpha" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));

    fireEvent.change(input, { target: { value: "beta" } });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByText("No results")).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Search status" }).textContent,
    ).toBe("No matches found.");

    await act(async () => {
      resolveFirstSearch?.(Response.json(alphaResult));
      await firstSearch;
    });
    expect(screen.getByText("No results")).toBeTruthy();
  });
});
