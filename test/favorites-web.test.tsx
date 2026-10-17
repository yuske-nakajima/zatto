// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../src/web/App.js";
import { initial, publish, Socket, setup } from "./favorites-web-fixture.js";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  vi.stubGlobal("WebSocket", Socket);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("Favorites follows List order without drag handles, keeps preview after unstar, and protects Clear All", async () => {
  const fetch = setup();
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTitle("Alpha preview");
  await user.click(screen.getByRole("button", { name: "Favorites" }));
  const list = screen.getByRole("list", { name: "Favorite HTML entries" });
  expect(
    within(list)
      .getAllByRole("listitem")
      .map(
        (row) =>
          within(row).getByRole("button", { name: /^Open / }).textContent,
      ),
  ).toEqual([
    expect.stringContaining("Beta"),
    expect.stringContaining("Gamma"),
  ]);
  expect(within(list).queryByRole("button", { name: "Open Alpha" })).toBeNull();
  expect(within(list).queryByRole("button", { name: /^Reorder / })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Clear all" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Open Beta" }));
  await user.click(screen.getByRole("button", { name: "Favorite Beta" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/session/b/favorite",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ favorite: false }),
      headers: {
        "content-type": "application/json",
        "x-zatto-workspace-id": "default",
      },
    }),
  );
  publish(
    initial.map((entry) =>
      entry.id === "b" ? { ...entry, favorite: false } : entry,
    ),
  );
  expect(screen.queryByRole("button", { name: "Open Beta" })).toBeNull();
  expect(screen.getByTitle("Beta preview")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "List" }));
  expect(
    screen
      .getAllByRole("button", { name: /^Reorder / })
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Reorder Alpha", "Reorder Beta", "Reorder Gamma"]);
});
test("keyboard toggles stars in List and Folders while copy and remove remain available", async () => {
  const fetch = setup();
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTitle("Alpha preview");
  const button = screen.getByRole("button", {
    name: "Favorite Alpha",
  });
  expect(button.getAttribute("aria-pressed")).toBe("false");
  button.focus();
  await user.keyboard(" ");
  expect(fetch).toHaveBeenCalledWith(
    "/api/session/a/favorite",
    expect.objectContaining({ body: JSON.stringify({ favorite: true }) }),
  );
  publish(
    initial.map((entry) =>
      entry.id === "a" ? { ...entry, favorite: true } : entry,
    ),
  );
  await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"));
  await user.click(screen.getByRole("button", { name: "Folders" }));
  const folderStar = screen.getByRole("button", {
    name: "Favorite Alpha",
  });
  expect(folderStar.getAttribute("aria-pressed")).toBe("true");
  folderStar.focus();
  await user.keyboard("{Enter}");
  expect(fetch).toHaveBeenCalledWith(
    "/api/session/a/favorite",
    expect.objectContaining({ body: JSON.stringify({ favorite: false }) }),
  );
  expect(
    screen.getByRole("button", { name: "Copy file path /docs/a.html" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Remove Gamma" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/session/c",
    expect.objectContaining({ method: "DELETE" }),
  );
});
test("Favorites with no starred entries explains how to populate it", async () => {
  setup(initial.map((entry) => ({ ...entry, favorite: false })));
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTitle("Alpha preview");
  await user.click(screen.getByRole("button", { name: "Favorites" }));
  expect(screen.getByText("No favorites in this workspace.")).toBeTruthy();
  expect(
    screen.getByText("Star files in List or Folders to find them here."),
  ).toBeTruthy();
  expect(screen.queryByText("Add HTML files from the CLI")).toBeNull();
});
test("failed star updates show an error without changing the displayed favorite state", async () => {
  const fetch = setup();
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTitle("Alpha preview");
  fetch.mockImplementationOnce(async () => new Response(null, { status: 500 }));
  await user.click(screen.getByRole("button", { name: "Favorite Alpha" }));
  expect(
    await screen.findByText("Could not update the favorite."),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Favorite Alpha" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});
