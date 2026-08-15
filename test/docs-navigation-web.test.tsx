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

describe("built-in documentation navigation", () => {
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
    vi.restoreAllMocks();
  });

  test("URLのページと言語からDocsだけを表示して同じページの言語を切り替える", async () => {
    window.history.replaceState(
      null,
      "",
      "/?entry=a&doc=api&lang=ja&searchView=1&search=alpha&match=1.0.5.0&matchText=Alpha",
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    const heading = screen.getByRole("heading", { name: "Documentation" });
    expect(document.activeElement).toBe(heading);
    expect(
      screen
        .getByTitle("First preview")
        .closest(".viewer")
        ?.hasAttribute("hidden"),
    ).toBe(true);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Docs" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "API" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByTitle("API documentation").getAttribute("src")).toBe(
      "/docs/ja/api.html",
    );
    expect(window.location.search).toContain("search=alpha");
    expect(window.location.search).not.toContain("searchView");
    expect(window.location.search).not.toContain("match=");
    expect(window.location.search).not.toContain("matchText=");

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByTitle("API documentation").getAttribute("src")).toBe(
      "/docs/en/api.html",
    );
    expect(window.location.search).toContain("doc=api");
    expect(window.location.search).not.toContain("lang=");
  });

  test("不正なDocs URLをGetting startedと英語へreplace正規化する", async () => {
    window.history.replaceState(
      { marker: "invalid" },
      "",
      "/?entry=a&doc=missing&lang=fr&extra=1#content",
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());

    expect(
      screen.getByTitle("Getting started documentation").getAttribute("src"),
    ).toBe("/docs/en/getting-started.html");
    const parameters = new URL(window.location.href).searchParams;
    expect(parameters.get("doc")).toBe("getting-started");
    expect(parameters.has("lang")).toBe(false);
    expect(parameters.get("extra")).toBe("1");
    expect(window.location.hash).toBe("#content");
    expect(replaceState).toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ marker: "invalid" });
  });

  test("Docsを開く前に検索表示状態をflushしてqueryだけを保持する", async () => {
    window.history.replaceState(
      null,
      "",
      "/?entry=a&searchView=1&search=alpha&match=2.3.5.0&matchText=Alpha",
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const results = screen.getByRole("region", { name: "Search results" });
    results.scrollTop = 44;
    fireEvent.scroll(results);
    const pushState = vi.spyOn(window.history, "pushState");

    fireEvent.click(screen.getByRole("button", { name: "Docs" }));

    expect(pushState).toHaveBeenCalledOnce();
    expect(pushState.mock.calls[0]?.[0]).toMatchObject({
      zattoSearch: { scrollTop: 44 },
    });
    const parameters = new URL(window.location.href).searchParams;
    expect(parameters.get("doc")).toBe("getting-started");
    expect(parameters.get("search")).toBe("alpha");
    expect(parameters.has("searchView")).toBe(false);
    expect(parameters.has("match")).toBe(false);
    expect(parameters.has("matchText")).toBe(false);
  });

  test("entry選択とSearch開始は1回の履歴追加でDocsを閉じて言語を保持する", async () => {
    window.history.replaceState(null, "", "/?entry=a&doc=cli&lang=ja");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const pushState = vi.spyOn(window.history, "pushState");

    fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
    expect(pushState).toHaveBeenCalledOnce();
    expect(screen.getByTitle("Second preview")).toBeTruthy();
    expect(window.location.search).not.toContain("doc=");
    expect(window.location.search).toContain("lang=ja");

    fireEvent.click(screen.getByRole("button", { name: "Docs" }));
    pushState.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(pushState).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("searchbox", { name: "Search HTML files" }),
    ).toBeTruthy();
    expect(window.location.search).not.toContain("doc=");
    expect(window.location.search).toContain("lang=ja");
  });

  test("Docsのcloseとpopstateでページと言語を復元する", async () => {
    window.history.replaceState(null, "", "/?entry=a&lang=ja");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(screen.getByRole("button", { name: "Docs" }));
    expect(
      screen.getByTitle("Getting started documentation").getAttribute("src"),
    ).toBe("/docs/ja/getting-started.html");
    fireEvent.click(screen.getByRole("button", { name: "GUI / API mapping" }));
    const docsUrl = relativeUrl();
    const docsState = window.history.state;

    fireEvent.click(
      screen.getByRole("button", { name: "Close documentation" }),
    );
    expect(screen.getByTitle("First preview")).toBeTruthy();
    expect(window.location.search).not.toContain("doc=");
    expect(window.location.search).toContain("lang=ja");

    act(() => dispatchHistory(docsUrl, docsState));
    expect(
      screen.getByTitle("GUI / API mapping documentation").getAttribute("src"),
    ).toBe("/docs/ja/gui-api-mapping.html");
  });
});

function relativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function dispatchHistory(url: string, state: unknown): void {
  window.history.replaceState(state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
