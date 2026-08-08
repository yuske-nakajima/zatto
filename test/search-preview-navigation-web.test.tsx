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
import type { SearchLineMatch, SearchResponse } from "../src/shared/search.js";
import { App } from "../src/web/App.js";

class FakeWebSocket extends EventTarget {
  close(): void {
    this.dispatchEvent(new Event("close"));
  }
}

const entry: Entry = {
  id: "a",
  title: "First",
  absPath: "/work/first.html",
  addedAt: 1,
};
const sources = [
  '<p data-label="alpha">alpha attribute</p>',
  '<script type="application/json">"alpha"</script>',
  "<p hidden>alpha</p>",
  '<p id="target">target alpha tail</p>',
];
const result: SearchResponse = {
  query: "alpha",
  totalMatches: sources.length + 1,
  truncated: false,
  files: [
    {
      entryId: entry.id,
      title: entry.title,
      fileName: "first.html",
      absPath: entry.absPath,
      matchCount: sources.length + 1,
      truncated: false,
      lines: sources.map(toSearchLine),
    },
  ],
};

describe("search preview navigation safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session"
          ? Response.json({ entries: [entry] })
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

  test("属性・script・hiddenは通常previewへ戻し、表示一致だけを選択する", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    const preview = screen.getByTitle("First preview") as HTMLIFrameElement;
    const previewDocument = preview.contentDocument;
    if (!previewDocument) throw new Error("preview document is unavailable");
    previewDocument.open();
    previewDocument.write(`<body>${sources.join("")}</body>`);
    previewDocument.close();

    for (const lineNumber of [1, 2, 3]) {
      fireEvent.click(
        screen.getByRole("button", {
          name: `Open first.html at line ${lineNumber}`,
        }),
      );
      expect(screen.getByTitle("First preview")).toBeTruthy();
      expect(window.location.search).not.toContain("match=");
      expect(previewDocument.getSelection()?.toString()).toBe("");
      fireEvent.click(
        screen.getByRole("button", { name: "Back to search results" }),
      );
      expect(
        screen.getByRole("searchbox", { name: "Search HTML files" }),
      ).toBeTruthy();
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Open first.html at line 4" }),
    );
    const target = previewDocument.querySelector<HTMLElement>("#target");
    if (target) target.scrollIntoView = vi.fn();
    fireEvent.load(preview);

    expect(pushState).toHaveBeenCalledTimes(7);
    expect(previewDocument.getSelection()?.anchorNode?.parentElement?.id).toBe(
      "target",
    );
  });

  test("証明不能な先行一致がある文脈なしの複数候補では選択しない", async () => {
    const ambiguousResult: SearchResponse = {
      query: "alpha",
      totalMatches: 2,
      truncated: false,
      files: [
        {
          entryId: entry.id,
          title: entry.title,
          fileName: "first.html",
          absPath: entry.absPath,
          matchCount: 2,
          truncated: false,
          lines: [
            { ...toSearchLine("<p>alpha</p>", 0), truncated: true },
            toSearchLine("<p>alpha</p>", 1),
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session"
          ? Response.json({ entries: [entry] })
          : Response.json(ambiguousResult),
      ),
    );
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(
      screen.getByRole("button", { name: "Open first.html at line 2" }),
    );
    const preview = screen.getByTitle("First preview") as HTMLIFrameElement;
    const previewDocument = preview.contentDocument;
    if (!previewDocument) throw new Error("preview document is unavailable");
    previewDocument.open();
    previewDocument.write("<body><p>alpha</p><p>alpha</p></body>");
    previewDocument.close();
    fireEvent.load(preview);

    expect(window.location.search).toContain("match=");
    expect(previewDocument.getSelection()?.toString()).toBe("");
  });
});

function toSearchLine(source: string, index: number): SearchLineMatch {
  const ranges = [...source.matchAll(/alpha/gu)].map((match) => ({
    start: match.index,
    length: match[0].length,
  }));
  return {
    lineNumber: index + 1,
    startOffset: 0,
    lineText: source,
    truncated: false,
    ranges,
  };
}
