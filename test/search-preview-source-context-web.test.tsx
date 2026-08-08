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

const entry: Entry = {
  id: "a",
  title: "First",
  absPath: "/work/first.html",
  addedAt: 1,
};
const result: SearchResponse = {
  query: "alpha",
  totalMatches: 1,
  truncated: false,
  files: [
    {
      entryId: entry.id,
      title: entry.title,
      fileName: "first.html",
      absPath: entry.absPath,
      matchCount: 1,
      truncated: false,
      lines: [
        {
          lineNumber: 2,
          startOffset: 0,
          lineText: "alpha {}",
          truncated: false,
          ranges: [{ start: 0, length: 5 }],
        },
      ],
    },
  ],
};

describe("multiline source context safety", () => {
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

  test.each([
    '<script type="application/json">\nalpha {}\n</script>',
    "<style>\nalpha {}\n</style>",
    "<p hidden>\nalpha {}\n</p>",
  ])("親要素を証明できない一致は通常previewへ戻す: %s", async (source) => {
    render(<App />);
    await act(async () => vi.runAllTimersAsync());
    fireEvent.click(
      screen.getByRole("button", { name: "Open first.html at line 2" }),
    );
    const preview = screen.getByTitle("First preview") as HTMLIFrameElement;
    const previewDocument = preview.contentDocument;
    if (!previewDocument) throw new Error("preview document is unavailable");
    previewDocument.open();
    previewDocument.write(`<body>${source}<p>alpha</p></body>`);
    previewDocument.close();
    fireEvent.load(preview);

    expect(window.location.search).not.toContain("match=");
    expect(previewDocument.getSelection()?.toString()).toBe("");
  });
});
