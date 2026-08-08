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
const result: SearchResponse = {
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
          lineText: "<p>first alpha tail</p>",
          truncated: false,
          ranges: [{ start: 9, length: 5 }],
        },
      ],
    },
  ],
};

describe("search target and entry history", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session"
          ? Response.json({ entries })
          : Response.json(result),
      ),
    );
    window.history.replaceState(
      null,
      "",
      "/?entry=a&searchView=1&search=alpha",
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("検索結果AからEntry Bへ進んだ後のBackでAの選択位置を復元する", async () => {
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(
      screen.getByRole("button", { name: "Open first.html at line 1" }),
    );
    const firstUrl = relativeUrl();
    expect(firstUrl).toContain("match=");
    const pushState = vi.spyOn(window.history, "pushState");

    fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
    expect(screen.getByTitle("Second preview")).toBeTruthy();
    const firstHistoryState = pushState.mock.calls[0]?.[0];
    expect(firstHistoryState).toMatchObject({
      zattoSearch: { previewTarget: { entryId: "a" } },
    });

    act(() => dispatchHistory(firstUrl, firstHistoryState));
    const preview = screen.getByTitle("First preview") as HTMLIFrameElement;
    const previewDocument = preview.contentDocument;
    if (!previewDocument) throw new Error("preview document is unavailable");
    previewDocument.open();
    previewDocument.write("<body><p id='target'>first alpha tail</p></body>");
    previewDocument.close();
    const target = previewDocument.querySelector<HTMLElement>("#target");
    if (target) target.scrollIntoView = vi.fn();
    fireEvent.load(preview);

    expect(previewDocument.getSelection()?.anchorNode?.parentElement?.id).toBe(
      "target",
    );
    expect(relativeUrl()).toBe(firstUrl);
  });
});

function relativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function dispatchHistory(url: string, state: unknown): void {
  window.history.replaceState(state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
