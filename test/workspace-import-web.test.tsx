// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../src/web/App.js";
import { rpcFixture, rpcRequest } from "./rpc-client-fixture.js";

class Socket extends EventTarget {
  static current: Socket;
  constructor() {
    super();
    Socket.current = this;
  }
  close() {}
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test.each(["workspace switches", "subsequent session updates"])(
  "an import response cannot restore obsolete entries after %s",
  async (scenario) => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("WebSocket", Socket);
    const entries = [
      { id: "a", title: "Alpha", absPath: "/a.html", addedAt: 1 },
    ];
    const workspaces = [
      { id: "default", name: "Default" },
      { id: "other", name: "Other" },
    ];
    let finish: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(
      rpcFixture(async (input) => {
        if (input === "session.get")
          return Response.json({
            entries,
            workspaces,
            activeWorkspaceId: "default",
          });
        if (input === "session.import") return pending;
        return Response.json({});
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");
    const exchange = JSON.stringify({
      format: "zatto-session",
      version: 1,
      entries: [{ path: "/import.html" }],
    });
    const file = new File([exchange], "session.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", { value: async () => exchange });
    await user.upload(screen.getByLabelText("Import session file"), file);
    await user.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/rpc",
        rpcRequest("session.import", { mode: "replace" }),
      ),
    );
    if (scenario === "workspace switches") {
      for (const id of ["other", "default"]) {
        act(() =>
          Socket.current.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "session:update",
                entries,
                workspaces,
                activeWorkspaceId: id,
              }),
            }),
          ),
        );
      }
    } else {
      for (const updatedEntries of [
        [{ id: "old", title: "Obsolete", absPath: "/old.html", addedAt: 1 }],
        [
          ...entries,
          { id: "new", title: "Added", absPath: "/new.html", addedAt: 2 },
        ],
      ]) {
        act(() =>
          Socket.current.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "session:update",
                entries: updatedEntries,
                workspaces,
                activeWorkspaceId: "default",
              }),
            }),
          ),
        );
      }
    }
    await act(async () => {
      finish(
        Response.json({
          entries: [
            { id: "old", title: "Obsolete", absPath: "/old.html", addedAt: 1 },
          ],
        }),
      );
      await pending;
    });
    expect(screen.getByTitle("Alpha preview")).toBeTruthy();
    expect(screen.queryByTitle("Obsolete preview")).toBeNull();
    if (scenario === "subsequent session updates")
      expect(screen.getByRole("button", { name: "Open Added" })).toBeTruthy();
  },
);
