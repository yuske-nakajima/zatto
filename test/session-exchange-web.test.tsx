// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

describe("session exchange web UI", () => {
  const initialEntries = [
    entry("a", "Alpha", "/work/a.html"),
    entry("b", "Bravo", "/work/b.html"),
  ];
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let anchorClick: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    createObjectUrl = vi.fn(() => "blob:zatto-session");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("エクスポートの注意を表示し、JSONをダウンロードする", async () => {
    const exchange = {
      format: "zatto-session",
      version: 1,
      entries: [{ path: "/work/a.html" }, { path: "/work/b.html" }],
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (input === "/api/session") {
        return Response.json({
          entries: initialEntries,
          serverIdentity: { instanceId: "managed" },
        });
      }
      if (input === "/api/session/export") return Response.json(exchange);
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");

    expect(
      screen.getByText(/absolute paths and local information/i),
    ).toBeTruthy();
    const importInput = screen.getByLabelText("Import session file");
    const importLabel = importInput.closest("label");
    expect(importLabel?.dataset.statusDescription).toBe(
      "Replace this session from a JSON file.",
    );
    const exportButton = screen.getByRole("button", {
      name: "Export session…",
    });
    expect(exportButton.dataset.statusDescription).toBe(
      "Download this session as a JSON file.",
    );
    await user.click(exportButton);

    expect(fetch).toHaveBeenCalledWith("/api/session/export");
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  test("インポート後は先頭を選択して検索を解除し、パネル状態を維持する", async () => {
    const importedEntries = [
      entry("x", "Imported First", "/work/imported-first.html"),
      entry("y", "Imported Second", "/work/imported-second.html"),
    ];
    let resolveImport: ((response: Response) => void) | undefined;
    const pendingImport = new Promise<Response>((resolve) => {
      resolveImport = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (input === "/api/session" && init?.method === "PUT") {
        return pendingImport;
      }
      if (input === "/api/session") {
        return Response.json({
          entries: initialEntries,
          serverIdentity: { instanceId: "managed" },
        });
      }
      return Response.json({ files: [], totalMatches: 0, truncated: false });
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");
    await user.click(screen.getByRole("button", { name: "Open Bravo" }));
    await user.click(screen.getByRole("button", { name: "Folders" }));
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search HTML files" }),
      "needle",
    );
    const exchange = {
      format: "zatto-session",
      version: 1,
      entries: importedEntries.map((item) => ({ path: item.absPath })),
    };
    const file = new File([JSON.stringify(exchange)], "session.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(exchange),
    });

    await user.upload(screen.getByLabelText("Import session file"), file);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/session",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const importLabel = screen.getByText("Importing…").closest("label");
    expect(importLabel?.getAttribute("aria-disabled")).toBe("true");
    expect(
      importLabel?.classList.contains("session-action-button--disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Hide file panel" }));
    resolveImport?.(Response.json({ entries: importedEntries }));

    expect(await screen.findByTitle("Imported First preview")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    const showFilePanel = screen.getByRole("button", {
      name: "Show file panel",
    });
    await user.click(showFilePanel);
    expect(
      screen
        .getByRole("button", { name: "Folders" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(window.location.search).not.toContain("needle");
    expect(fetch).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-zatto-instance-id": "managed",
        },
        body: JSON.stringify(exchange),
      }),
    );
  });

  test("不正なJSONを送信せず既存セッションを維持する", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ entries: initialEntries }),
    );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");
    const file = new File(["{broken"], "broken.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", { value: async () => "{broken" });

    await user.upload(screen.getByLabelText("Import session file"), file);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not import the session.",
    );
    expect(screen.getByTitle("Alpha preview")).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
