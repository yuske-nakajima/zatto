// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";
import { rpcFixture, rpcMethod, rpcRequest } from "./rpc-client-fixture.js";

class FakeWebSocket extends EventTarget {
  static instance: FakeWebSocket | null = null;

  constructor() {
    super();
    FakeWebSocket.instance = this;
  }

  close(): void {}

  emitEntries(entries: Entry[]): void {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "session:update", entries }),
      }),
    );
  }
}

const initialEntry: Entry = {
  id: "existing",
  title: "Existing",
  absPath: "/workspace/existing.html",
  addedAt: 1,
};

function sessionResponse(): Response {
  return Response.json({
    entries: [initialEntry],
    filePicker: { available: true, instanceId: "instance" },
    directoryPicker: { available: true, instanceId: "instance" },
  });
}

describe("directory picker", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("直接配下を既定値としてフォルダー選択を要求する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        rpcFixture(async (input) => {
          if (input === "session.get") return sessionResponse();
          return Response.json({ cancelled: true, added: [] });
        }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Existing preview");

    await user.click(screen.getByRole("button", { name: "Add folder" }));
    expect(
      (
        screen.getByRole("radio", {
          name: /Direct children/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Choose folder" }));

    expect(fetch).toHaveBeenCalledWith(
      "/rpc",
      rpcRequest("session.pickDirectory", {
        mode: "direct",
        instanceId: "instance",
      }),
    );
    expect(screen.getByTitle("Existing preview")).toBeTruthy();
  });

  test("ツリー配下を追加して最初の追加項目を選択する", async () => {
    const addedEntry: Entry = {
      id: "nested",
      title: "Nested",
      absPath: "/workspace/nested/page.html",
      addedAt: 2,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        rpcFixture(async (input) => {
          if (input === "session.get") return sessionResponse();
          return Response.json({ cancelled: false, added: [addedEntry] });
        }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Existing preview");

    await user.click(screen.getByRole("button", { name: "Add folder" }));
    await user.click(screen.getByRole("radio", { name: /Entire folder tree/ }));
    await user.click(screen.getByRole("button", { name: "Choose folder" }));
    act(() => FakeWebSocket.instance?.emitEntries([initialEntry, addedEntry]));

    expect(fetch).toHaveBeenCalledWith(
      "/rpc",
      rpcRequest("session.pickDirectory", { mode: "recursive" }),
    );
    expect(await screen.findByTitle("Nested preview")).toBeTruthy();
    expect(window.location.search).toBe("?entry=nested");
  });

  test("0件なら選択を維持して結果を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        rpcFixture(async (input) =>
          input === "session.get"
            ? sessionResponse()
            : Response.json({ cancelled: false, added: [] }),
        ),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Existing preview");

    await user.click(screen.getByRole("button", { name: "Add folder" }));
    await user.click(screen.getByRole("button", { name: "Choose folder" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No HTML or Markdown files were added from the selected folder.",
    );
    expect(screen.getByTitle("Existing preview")).toBeTruthy();
  });

  test("フォルダーピッカー中はファイルピッカーと重複要求を開始しない", async () => {
    let resolveDirectory: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      rpcFixture((input) => {
        if (input === "session.get") return Promise.resolve(sessionResponse());
        if (input === "agentContext.set") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return new Promise<Response>((resolve) => {
          resolveDirectory = resolve;
        });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Existing preview");

    await user.click(screen.getByRole("button", { name: "Add folder" }));
    await user.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() => expect(nonContextRequests(fetchMock)).toHaveLength(2));
    expect(
      screen
        .getByRole("button", { name: "Add HTML or Markdown files" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.keyboard("{Meta>}o{/Meta}");
    expect(nonContextRequests(fetchMock)).toHaveLength(2);

    resolveDirectory?.(Response.json({ cancelled: true, added: [] }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Add HTML or Markdown files" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  });

  test("フォルダー選択の失敗を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        rpcFixture(async (input) =>
          input === "session.get"
            ? sessionResponse()
            : new Response(null, { status: 500 }),
        ),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Existing preview");

    await user.click(screen.getByRole("button", { name: "Add folder" }));
    await user.click(screen.getByRole("button", { name: "Choose folder" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not add HTML or Markdown files from the selected folder.",
    );
  });
});

function nonContextRequests(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    ([, init]) => rpcMethod(init) !== "agentContext.set",
  );
}
