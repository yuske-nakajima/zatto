// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/web/App.js";

class FakeWebSocket extends EventTarget {
  close(): void {
    this.dispatchEvent(new Event("close"));
  }
}

describe("file panel preference migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: [] })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("URLにfileViewがない初回だけlocalStorageから移行する", async () => {
    window.localStorage.setItem("zatto:file-panel-view", "directories");
    window.history.replaceState(null, "", "/?extra=1#files");
    render(<App />);

    expect(
      (await screen.findByRole("button", { name: "Folders" })).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(window.location.search).toContain("fileView=folders");
    expect(window.location.search).toContain("extra=1");

    act(() => {
      window.history.replaceState(null, "", "/?extra=2#files");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(
      screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("明示されたURL値をlocalStorageより優先し互換用設定へ同期する", async () => {
    window.localStorage.setItem("zatto:file-panel-view", "directories");
    window.history.replaceState(null, "", "/?fileView=list");
    render(<App />);

    expect(
      (await screen.findByRole("button", { name: "List" })).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(window.localStorage.getItem("zatto:file-panel-view")).toBe("list");
  });
});
