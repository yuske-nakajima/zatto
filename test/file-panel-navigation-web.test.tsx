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

describe("file panel URL navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session"
          ? Response.json({ entries })
          : Response.json({ query: "alpha", files: [], totalMatches: 0 }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("reload時にfileViewとpanelをURLから復元する", async () => {
    window.history.replaceState(
      null,
      "",
      "/?fileView=folders&panel=closed&entry=b&extra=1#preview",
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    const closedUrl = relativeUrl();
    const closedState = window.history.state;
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show file panel" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show file panel" }));
    const openUrl = relativeUrl();
    const openState = window.history.state;
    expect(
      screen
        .getByRole("button", { name: "Folders" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTitle("Second preview")).toBeTruthy();

    act(() => dispatchHistory(closedUrl, closedState));
    expect(screen.queryByRole("complementary")).toBeNull();
    act(() => dispatchHistory(openUrl, openState));
    expect(screen.getByRole("complementary")).toBeTruthy();
  });

  test("表示方式とpanel変更だけを履歴化し、他のURL情報を保持する", async () => {
    window.history.replaceState(
      null,
      "",
      "/?entry=a&search=alpha&match=2.3.5.0&matchText=Alpha&extra=1#preview",
    );
    const pushState = vi.spyOn(window.history, "pushState");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Folders" }));
    fireEvent.click(screen.getByRole("button", { name: "Folders" }));
    expect(pushState).toHaveBeenCalledOnce();
    expect(window.location.search).toContain("fileView=folders");
    expect(window.location.search).toContain("match=2.3.5.0");
    expect(window.location.search).toContain("extra=1");
    expect(window.location.hash).toBe("#preview");

    fireEvent.click(screen.getByRole("button", { name: "Hide file panel" }));
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(window.location.search).toContain("panel=closed");
    expect(window.location.search).toContain("fileView=folders");
  });

  test("検索中の表示方式変更をBackとForwardで復元する", async () => {
    window.history.replaceState(
      { marker: "list" },
      "",
      "/?entry=a&searchView=1&search=alpha&extra=1#results",
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const listUrl = relativeUrl();
    const listState = window.history.state;

    fireEvent.click(screen.getByRole("button", { name: "Folders" }));
    const foldersUrl = relativeUrl();
    const foldersState = window.history.state;
    expect(foldersUrl).toContain("searchView=1");
    expect(foldersUrl).toContain("search=alpha");

    act(() => dispatchHistory(listUrl, listState));
    expect(
      screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("searchbox", { name: "Search HTML files" }),
    ).toBeTruthy();
    act(() => dispatchHistory(foldersUrl, foldersState));
    expect(
      screen
        .getByRole("button", { name: "Folders" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("invalid値を既定状態へ正規化する", async () => {
    window.history.replaceState(
      null,
      "",
      "/?fileView=grid&panel=side&entry=a&extra=1#preview",
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    expect(
      screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(window.location.search).not.toContain("fileView=");
    expect(window.location.search).not.toContain("panel=");
    expect(window.location.search).toContain("extra=1");
    expect(window.location.hash).toBe("#preview");
  });

  test("entry履歴とのBackとForwardでも表示方式を維持する", async () => {
    window.history.replaceState(null, "", "/?entry=a");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(screen.getByRole("button", { name: "Folders" }));
    const firstUrl = relativeUrl();
    const firstState = window.history.state;

    fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
    const secondUrl = relativeUrl();
    const secondState = window.history.state;
    expect(secondUrl).toContain("fileView=folders");
    expect(screen.getByTitle("Second preview")).toBeTruthy();

    act(() => dispatchHistory(firstUrl, firstState));
    expect(screen.getByTitle("First preview")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Folders" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    act(() => dispatchHistory(secondUrl, secondState));
    expect(screen.getByTitle("Second preview")).toBeTruthy();
  });
});

function relativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function dispatchHistory(url: string, state: unknown): void {
  window.history.replaceState(state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
