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

describe("entry URL navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session"
          ? Response.json({ entries })
          : Response.json({ query: "", files: [], totalMatches: 0 }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("通常のentry選択も履歴化してpopstateで復元する", async () => {
    window.history.replaceState(null, "", "/?panel=open&entry=a#preview");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const firstUrl = relativeUrl();
    const firstState = window.history.state;

    fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
    const secondUrl = relativeUrl();
    const secondState = window.history.state;
    expect(screen.getByTitle("Second preview")).toBeTruthy();

    act(() => dispatchHistory(firstUrl, firstState));
    expect(screen.getByTitle("First preview")).toBeTruthy();
    act(() => dispatchHistory(secondUrl, secondState));
    expect(screen.getByTitle("Second preview")).toBeTruthy();
  });

  test("invalidまたはstaleなURL状態を既存情報を保って正規化する", async () => {
    window.history.replaceState(
      null,
      "",
      `/?panel=open&entry=missing&searchView=invalid&search=${"a".repeat(300)}&match=bad&matchText=x#preview`,
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    expect(screen.getByTitle("First preview")).toBeTruthy();
    expect(window.location.search).toContain("panel=open");
    expect(
      new URL(window.location.href).searchParams.get("search"),
    ).toHaveLength(256);
    expect(window.location.search).not.toContain("searchView");
    expect(window.location.search).not.toContain("match=");
    expect(window.location.hash).toBe("#preview");
  });

  test("staleなentryを正規化しても検索画面とURLを同期して維持する", async () => {
    window.history.replaceState(
      null,
      "",
      "/?entry=missing&searchView=1&search=alpha",
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    expect(
      screen.getByRole("searchbox", { name: "Search HTML files" }),
    ).toBeTruthy();
    const parameters = new URL(window.location.href).searchParams;
    expect(parameters.get("entry")).toBe("a");
    expect(parameters.get("searchView")).toBe("1");
    expect(parameters.get("search")).toBe("alpha");
  });

  test("Unicode文字を分断せずqueryを上限内に正規化する", async () => {
    const query = `${"a".repeat(255)}😀`;
    const parameters = new URLSearchParams({ searchView: "1", search: query });
    window.history.replaceState(null, "", `/?${parameters}`);

    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    const expected = "a".repeat(255);
    expect(
      screen.getByRole<HTMLInputElement>("searchbox", {
        name: "Search HTML files",
      }).value,
    ).toBe(expected);
    expect(new URL(window.location.href).searchParams.get("search")).toBe(
      expected,
    );
    expect(fetch).toHaveBeenCalledWith(
      `/api/search?q=${expected}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("表示中の検索画面を再度開いても履歴を増やさない", async () => {
    window.history.replaceState(null, "", "/?entry=a");
    const pushState = vi.spyOn(window.history, "pushState");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);
    fireEvent.click(searchButton);

    expect(pushState).toHaveBeenCalledOnce();
  });

  test("連続scrollの履歴保存をまとめ、画面遷移前にはflushする", async () => {
    window.history.replaceState(null, "", "/?entry=a&searchView=1");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const replaceState = vi.spyOn(window.history, "replaceState");
    const results = screen.getByRole("region", { name: "Search results" });

    for (const scrollTop of [10, 20, 30]) {
      results.scrollTop = scrollTop;
      fireEvent.scroll(results);
    }
    expect(replaceState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));

    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState.mock.calls[0]?.[0]).toMatchObject({
      zattoSearch: { scrollTop: 30 },
    });
    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(replaceState).toHaveBeenCalledOnce();
  });

  test("scroll保存待ちのpopstateで移動先の履歴stateを上書きしない", async () => {
    window.history.replaceState(null, "", "/?entry=a&searchView=1");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const results = screen.getByRole("region", { name: "Search results" });
    results.scrollTop = 90;
    fireEvent.scroll(results);
    const destinationState = {
      zattoSearch: {
        scrollTop: 5,
        collapsedEntryIds: ["b"],
        previewTarget: null,
      },
    };

    act(() => dispatchHistory("/?entry=a&searchView=1", destinationState));
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(window.history.state).toEqual(destinationState);
    expect(results.scrollTop).toBe(5);
  });
});

function relativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function dispatchHistory(url: string, state: unknown): void {
  window.history.replaceState(state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
