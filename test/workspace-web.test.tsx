// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../src/web/App.js";
import { WorkspaceControls } from "../src/web/WorkspaceControls.js";
import { rpcFixture, rpcMethod, rpcRequest } from "./rpc-client-fixture.js";

class Socket extends EventTarget {
  static current: Socket;
  constructor() {
    super();
    Socket.current = this;
  }
  close() {}
}
const states = [
  { id: "default", name: "Default" },
  { id: "research", name: "Research" },
];
const first = { id: "one", title: "One", absPath: "/one.html", addedAt: 1 };
const second = { id: "two", title: "Two", absPath: "/two.html", addedAt: 2 };
function update(activeWorkspaceId: string, entries = [second]) {
  act(() =>
    Socket.current.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "session:update",
          activeWorkspaceId,
          workspaces: states,
          entries,
        }),
      }),
    ),
  );
}
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test("switching clears search, selects available entries, and sends clear to the displayed workspace", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    rpcFixture(async (input) =>
      input === "session.get"
        ? Response.json({
            entries: [first],
            activeWorkspaceId: "default",
            workspaces: states,
          })
        : Response.json({ files: [], totalMatches: 0, truncated: false }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTitle("One preview");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.type(
    screen.getByRole("searchbox", { name: "Search files" }),
    "needle",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Workspace" }),
    "research",
  );
  expect(fetch).toHaveBeenCalledWith(
    "/rpc",
    rpcRequest("workspaces.activate", { id: "research" }),
  );
  update("research");
  await screen.findByTitle("Two preview");
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(window.location.search).not.toContain("needle");
  expect(
    (screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement)
      .value,
  ).toBe("research");
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(fetch).toHaveBeenCalledWith(
    "/rpc",
    rpcRequest("session.clear", { workspaceId: "research" }),
  );
});
test.each([false, true])(
  "a delayed picker does not override selection after workspace changes (return: %s)",
  async (returnToOriginal) => {
    let finish: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(
      rpcFixture(async (input) => {
        if (input === "session.get")
          return Response.json({
            entries: [first],
            activeWorkspaceId: "default",
            workspaces: states,
            filePicker: { available: true, instanceId: "server" },
          });
        if (input === "session.pickFiles") return pending;
        return Response.json({});
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("One preview");
    await user.click(
      screen.getByRole("button", { name: "Add HTML or Markdown files" }),
    );
    update("research");
    await screen.findByTitle("Two preview");
    if (returnToOriginal) {
      update("default", [first]);
      await screen.findByTitle("One preview");
    }
    await act(async () => {
      finish(
        Response.json({ cancelled: false, added: [{ ...first, id: "late" }] }),
      );
      await pending;
    });
    expect(
      screen.getByTitle(returnToOriginal ? "One preview" : "Two preview"),
    ).toBeTruthy();
    expect(window.location.search).not.toContain("late");
  },
);
test("workspace creation activates its returned ID and deletion requires confirmation", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    rpcFixture(async () => Response.json({ id: "created", name: "Notes" })),
  );
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(window, "prompt").mockReturnValue("Notes");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(
    <WorkspaceControls
      state={{ activeWorkspaceId: "default", workspaces: states }}
      reportError={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "New workspace" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/rpc",
      rpcRequest("workspaces.activate", { id: "created" }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(
    fetch.mock.calls.some(
      ([, init]) => rpcMethod(init) === "workspaces.delete",
    ),
  ).toBe(false);
});
