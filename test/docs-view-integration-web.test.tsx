// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";

class FakeWebSocket extends EventTarget {
  close(): void {}
}

const entries: Entry[] = [
  { id: "a", title: "First", absPath: "/work/first.html", addedAt: 1 },
  { id: "b", title: "Second", absPath: "/work/second.html", addedAt: 2 },
];

const exchange = {
  format: "zatto-session",
  version: 1,
  entries: entries.map(({ absPath }) => ({ path: absPath })),
};

describe("built-in documentation view integration", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?entry=a");
    window.localStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) =>
        input === "/api/session/export"
          ? Response.json(exchange)
          : Response.json({ entries }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("Docsとの往復でpreview iframeを同じノードのまま保持する", async () => {
    const user = userEvent.setup();
    render(<App />);
    const preview = await screen.findByTitle("First preview");

    await user.click(screen.getByRole("button", { name: "Docs" }));
    expect(screen.getByTitle("First preview")).toBe(preview);
    expect(preview.closest(".viewer")?.hasAttribute("hidden")).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Close documentation" }),
    );
    expect(screen.getByTitle("First preview")).toBe(preview);
    expect(preview.closest(".viewer")?.hasAttribute("hidden")).toBe(false);
  });

  test("Docs内のClose後にステータスバーのDocsへfocusを戻す", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("First preview");
    const trigger = screen.getByRole("button", { name: "Docs" });

    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Close documentation" }),
    );

    expect(document.activeElement).toBe(trigger);
  });

  test("ステータスバーのDocsを表示状態に応じたトグルとして扱う", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("First preview");
    const trigger = screen.getByRole("button", { name: "Docs" });
    const description = document.querySelector(".status-bar-description");
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(trigger.dataset.statusDescription).toBe(
      "Open the built-in documentation.",
    );
    expect(description?.textContent).toBe("");

    await user.click(trigger);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    expect(trigger.dataset.statusDescription).toBe(
      "Close the built-in documentation.",
    );
    fireEvent.pointerOver(trigger);
    expect(description?.textContent).toBe("Close the built-in documentation.");
    await user.click(trigger);

    expect(screen.queryByRole("heading", { name: "Documentation" })).toBeNull();
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    fireEvent.pointerOver(trigger);
    expect(description?.textContent).toBe("Open the built-in documentation.");
  });

  test("Docs表示中も通常entryだけをListとFoldersとexportの対象にする", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn<(blob: Blob) => string>(
      () => "blob:zatto-session",
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<App />);
    await screen.findByTitle("First preview");
    await user.click(screen.getByRole("button", { name: "Docs" }));
    const docsFrame = screen.getByTitle("Getting started documentation");

    await user.click(screen.getByRole("button", { name: "Folders" }));
    expect(screen.getByTitle("Getting started documentation")).toBe(docsFrame);
    await user.click(screen.getByRole("button", { name: "List" }));
    const entryList = screen.getByRole("list", { name: "HTML entries" });
    expect(
      within(entryList).getAllByRole("button", { name: /^Open / }),
    ).toHaveLength(entries.length);
    expect(within(entryList).queryByText("Docs")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Export session…" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(fetch).toHaveBeenCalledWith("/api/session/export");
    expect(createObjectUrl).toHaveBeenCalledOnce();
    const exportedBlob = createObjectUrl.mock.calls[0]?.[0];
    if (!exportedBlob) throw new Error("exported Blob is unavailable");
    expect(JSON.parse(await exportedBlob.text())).toEqual(exchange);
    expect(screen.getByTitle("Getting started documentation")).toBe(docsFrame);
    expect(window.location.search).toContain("doc=getting-started");
  });
});
