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
  { id: "b", title: "Second", absPath: "/work/second.html", addedAt: 2 },
];

const searchResponse: SearchResponse = {
  query: "alpha",
  totalMatches: 2,
  truncated: false,
  files: [
    {
      entryId: "a",
      title: "First",
      fileName: "first.html",
      absPath: "/work/first.html",
      matchCount: 2,
      truncated: false,
      lines: [
        {
          lineNumber: 2,
          startOffset: 0,
          lineText: "<p>Alpha alpha</p>",
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

describe("HTML search view", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("検索結果からプレビューへ移動して検索状態を復元する", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        if (input === "/api/session") {
          return Response.json({ entries });
        }
        return Response.json(searchResponse);
      }),
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByRole("searchbox", { name: "Search HTML files" });
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(
      screen.getByRole("status", { name: "Searching HTML files" }),
    ).toBeTruthy();

    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByText("2 matches")).toBeTruthy();
    expect(screen.getAllByText(/alpha/i)).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse first.html" }),
    );
    expect(
      screen.queryByRole("button", { name: "Open first.html at line 2" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand first.html" }));
    const resultsRegion = screen.getByRole("region", {
      name: "Search results",
    });
    resultsRegion.scrollTop = 96;
    fireEvent.scroll(resultsRegion);
    fireEvent.click(
      screen.getByRole("button", { name: "Open first.html at line 2" }),
    );

    expect(
      screen.getByRole("button", { name: "Back to search results" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to search results" }),
    );

    expect(
      screen
        .getByRole("searchbox", { name: "Search HTML files" })
        .getAttribute("value"),
    ).toBe("alpha");
    expect(
      screen.getByRole("region", { name: "Search results" }).scrollTop,
    ).toBe(96);
  });

  test("更新中は結果を保持し、失敗時に再試行できる", async () => {
    vi.useFakeTimers();
    let searchAttempt = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === "/api/session") {
        return Response.json({ entries });
      }
      searchAttempt += 1;
      if (searchAttempt === 2) {
        throw new Error("read failed");
      }
      return Response.json({
        ...searchResponse,
        query: searchAttempt === 1 ? "alpha" : "beta",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByRole("searchbox", { name: "Search HTML files" });
    fireEvent.change(input, { target: { value: "alpha" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByText("2 matches")).toBeTruthy();
    const liveStatus = screen.getByRole("status", { name: "Search status" });
    expect(liveStatus.textContent).toBe("2 matches in 1 file.");

    fireEvent.change(input, { target: { value: "beta" } });
    expect(screen.getByText("2 matches")).toBeTruthy();
    expect(liveStatus.textContent).toBe("Updating search results.");
    expect(
      screen.getByRole("status", { name: "Updating search results" }),
    ).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(250));

    expect(screen.getByRole("alert").textContent).toContain("Search failed");
    expect(liveStatus.textContent).toBe("Search failed.");
    expect(
      screen.getByText("The HTML files could not be searched."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => vi.advanceTimersByTimeAsync(250));

    expect(searchAttempt).toBe(3);
    expect(screen.queryByText("Search failed")).toBeNull();
    expect(liveStatus.textContent).toBe("2 matches in 1 file.");
  });
});
