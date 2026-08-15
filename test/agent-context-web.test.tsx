// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";

const entries: Entry[] = [
  { id: "alpha", title: "Alpha", absPath: "/work/alpha.html", addedAt: 1 },
];

class FakeWebSocket extends EventTarget {
  close(): void {}
}

describe("ブラウザーのAgentコンテキスト同期", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?entry=alpha");
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("選択エントリとメイン表示をサーバーへ同期する", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url === "/api/session") return Response.json({ entries });
        return new Response(null, { status: 204 });
      }),
    );

    render(<App />);
    await screen.findByTitle("Alpha preview");

    expect(requests).toContainEqual({
      url: "/api/agent/context",
      init: expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ activeEntryId: "alpha", view: "preview" }),
      }),
    });

    screen.getByRole("button", { name: "Docs" }).click();
    expect(
      await screen.findByRole("heading", { name: "Documentation" }),
    ).toBeTruthy();
    expect(requests).toContainEqual({
      url: "/api/agent/context",
      init: expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ activeEntryId: "alpha", view: "docs" }),
      }),
    });
  });

  test("同期失敗はビューアーの操作を妨げない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/session") {
          return Response.json({ entries });
        }
        throw new Error("offline");
      }),
    );

    render(<App />);

    expect(await screen.findByTitle("Alpha preview")).toBeTruthy();
    expect(screen.queryByText("Could not load the session.")).toBeNull();
  });
});
