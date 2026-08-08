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

const firstFileLines = [
  searchLine(1, "<p hidden>alpha</p>", 10),
  searchLine(2, "<p>first Alpha context</p>", 9),
  searchLine(3, "<p>second Alpha context</p>", 10),
];
const secondFileLines = [searchLine(2, "<p>alpha</p>", 3)];

const result: SearchResponse = {
  query: "alpha",
  totalMatches: 4,
  truncated: false,
  files: entries.map((entry, index) => ({
    entryId: entry.id,
    title: entry.title,
    fileName: index === 0 ? "first.html" : "second.html",
    absPath: entry.absPath,
    matchCount: index === 0 ? 3 : 1,
    truncated: false,
    lines: index === 0 ? firstFileLines : secondFileLines,
  })),
};

describe("search URL navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session"
          ? Response.json({ entries })
          : Response.json(result),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("reload時にURLから検索画面とqueryを復元して再検索する", async () => {
    window.history.replaceState(
      null,
      "",
      "/?panel=open&entry=a&searchView=1&search=alpha#preview",
    );

    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    expect(
      screen
        .getByRole("searchbox", { name: "Search HTML files" })
        .getAttribute("value"),
    ).toBe("alpha");
    expect(fetch).toHaveBeenCalledWith(
      "/api/search?q=alpha",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText("4 matches in 2 files")).toBeTruthy();
    expect(window.location.href).toBe(
      "http://localhost:3000/?panel=open&entry=a&searchView=1&search=alpha#preview",
    );
  });

  test("操作を履歴化しpopstateで検索状態と結果previewを復元する", async () => {
    window.history.replaceState(null, "", "/?panel=open&entry=a#preview");
    const pushState = vi.spyOn(window.history, "pushState");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByRole("searchbox", { name: "Search HTML files" });
    fireEvent.change(input, { target: { value: "alpha" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    const results = screen.getByRole("region", { name: "Search results" });
    results.scrollTop = 77;
    fireEvent.scroll(results);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse second.html" }),
    );
    const searchUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const searchState = window.history.state;

    fireEvent.click(
      screen.getByRole("button", { name: "Open first.html at line 2" }),
    );
    const previewUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const previewState = window.history.state;
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(window.location.search).toContain("search=alpha");
    expect(window.location.search).toContain("match=");
    expect(window.location.search).toContain("matchText=Alpha");
    expect(window.location.search).not.toContain("matchContext=");
    expect(window.location.search).not.toContain("searchView");
    expect(previewState).toMatchObject({
      zattoSearch: {
        previewTarget: { prefix: "first ", suffix: " context" },
      },
    });
    const preview = screen.getByTitle("First preview") as HTMLIFrameElement;
    const previewDocument = preview.contentDocument;
    if (!previewDocument) throw new Error("preview document is unavailable");
    previewDocument.open();
    previewDocument.write(
      "<body><p hidden>alpha</p><p id='target'>first Alpha context</p><p id='other'>second Alpha context</p></body>",
    );
    previewDocument.close();
    const target = previewDocument.querySelector<HTMLElement>("#target");
    if (target) target.scrollIntoView = vi.fn();
    fireEvent.load(preview);
    expect(previewDocument.getSelection()?.anchorNode?.parentElement?.id).toBe(
      "target",
    );

    act(() => dispatchHistory(searchUrl, searchState));
    expect(input.getAttribute("value")).toBe("alpha");
    expect(
      screen.getByRole("region", { name: "Search results" }).scrollTop,
    ).toBe(77);
    expect(
      screen.getByRole("button", { name: "Expand second.html" }),
    ).toBeTruthy();

    previewDocument.getSelection()?.removeAllRanges();
    act(() => dispatchHistory(previewUrl, previewState));
    expect(screen.getByTitle("First preview")).toBeTruthy();
    expect(previewDocument.getSelection()?.anchorNode?.parentElement?.id).toBe(
      "target",
    );
    expect(window.location.search).toContain("match=");

    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    expect(previewDocument.getSelection()?.toString()).toBe("");
  });
});

function dispatchHistory(url: string, state: unknown): void {
  window.history.replaceState(state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

function searchLine(lineNumber: number, lineText: string, start: number) {
  return {
    lineNumber,
    startOffset: 0,
    lineText,
    truncated: false,
    ranges: [{ start, length: 5 }],
  };
}
