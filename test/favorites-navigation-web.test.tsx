// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../src/web/App.js";
import { rpcFixture } from "./rpc-client-fixture.js";

class Socket extends EventTarget {
  close() {}
}
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      rpcFixture(async () =>
        Response.json({
          entries: [
            {
              id: "a",
              title: "Alpha",
              absPath: "/a.html",
              addedAt: 1,
              favorite: true,
            },
          ],
        }),
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test.each(["URL", "stored preference"])(
  "Favorites restores from %s and round-trips through history and reload",
  async (source) => {
    if (source === "URL")
      window.history.replaceState(null, "", "/?fileView=favorites&extra=1");
    else window.localStorage.setItem("zatto:file-panel-view", "favorites");
    const user = userEvent.setup();
    const mounted = render(<App />);
    await screen.findByTitle("Alpha preview");
    expect(
      screen
        .getByRole("button", { name: "Favorites" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(window.location.search).toContain("fileView=favorites");
    const favoritesUrl = window.location.href;
    const favoritesState = window.history.state;
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(window.location.search).not.toContain("fileView=favorites");
    act(() => {
      window.history.replaceState(favoritesState, "", favoritesUrl);
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: favoritesState }),
      );
    });
    expect(
      screen
        .getByRole("button", { name: "Favorites" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    mounted.unmount();
    render(<App />);
    await screen.findByTitle("Alpha preview");
    expect(
      screen.getByRole("list", { name: "Favorite HTML entries" }),
    ).toBeTruthy();
    expect(window.localStorage.getItem("zatto:file-panel-view")).toBe(
      "favorites",
    );
  },
);
