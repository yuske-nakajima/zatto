// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";

class FakeWebSocket extends EventTarget {
  close(): void {}
}

function entry(id: string, title: string, absPath: string): Entry {
  return { id, title, absPath, addedAt: 1 };
}

describe("session import search history", () => {
  const initialEntries = [entry("a", "Alpha", "/work/a.html")];
  const importedEntries = [entry("x", "Imported", "/work/imported.html")];

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("import後のBackとForwardで旧検索状態を復元しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async (input, init) => {
        if (input === "/api/session" && init?.method === "PUT") {
          return Response.json({ entries: importedEntries });
        }
        if (input === "/api/session") {
          return Response.json({
            entries: initialEntries,
            serverIdentity: { instanceId: "managed" },
          });
        }
        return Response.json({
          query: "needle",
          totalMatches: 1,
          truncated: false,
          files: [
            {
              entryId: "a",
              title: "Alpha",
              fileName: "a.html",
              absPath: "/work/a.html",
              matchCount: 1,
              truncated: false,
              lines: [
                {
                  lineNumber: 1,
                  startOffset: 0,
                  lineText: "needle",
                  truncated: false,
                  ranges: [{ start: 0, length: 6 }],
                },
              ],
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");
    await user.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search HTML files" }),
      { target: { value: "needle" } },
    );
    const collapse = await screen.findByRole("button", {
      name: "Collapse a.html",
    });
    fireEvent.click(collapse);
    const results = screen.getByRole("region", { name: "Search results" });
    results.scrollTop = 81;
    fireEvent.scroll(results);
    const oldUrl = relativeUrl();
    const oldState = window.history.state;
    const exchange = {
      format: "zatto-session",
      version: 1,
      entries: [{ path: "/work/imported.html" }],
    };
    const file = new File([JSON.stringify(exchange)], "session.json");
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(exchange),
    });

    await user.upload(screen.getByLabelText("Import session file"), file);
    await screen.findByTitle("Imported preview");
    const importedUrl = relativeUrl();
    const importedState = window.history.state;

    dispatchHistory(oldUrl, oldState);
    await waitFor(() => expect(relativeUrl()).not.toContain("search=needle"));
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(window.history.state.zattoSearch).toMatchObject({
      scrollTop: 0,
      collapsedEntryIds: [],
      previewTarget: null,
    });

    dispatchHistory(importedUrl, importedState);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(relativeUrl()).not.toContain("search=needle");
  });
});

function relativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function dispatchHistory(url: string, state: unknown): void {
  window.history.replaceState(state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
