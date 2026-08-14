// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";
import { DirectoryTree } from "../src/web/DirectoryTree.js";
import {
  collectDirectoryEntryIds,
  type DirectoryTreeNode,
} from "../src/web/directory-tree-model.js";

class FakeWebSocket extends EventTarget {
  close(): void {}
}

function entry(id: string, title: string, absPath: string): Entry {
  return { id, title, absPath, addedAt: 1 };
}

const folderEntries = [
  entry("report", "Report", "/workspace/reports/index.html"),
  entry("daily", "Daily", "/workspace/reports/daily/index.html"),
  entry("archive", "Archive", "/workspace/reports-archive/index.html"),
];

describe("folder session removal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("collects direct and descendant entry IDs without adjacent siblings", () => {
    const node: DirectoryTreeNode = {
      directory: "/workspace/reports",
      name: "reports",
      entries: [folderEntries[0]],
      children: [
        {
          directory: "/workspace/reports/daily",
          name: "daily",
          entries: [folderEntries[1]],
          children: [],
        },
      ],
    };

    expect(collectDirectoryEntryIds(node)).toEqual(["report", "daily"]);
  });

  test("renders a session-removal control for every folder and calls once", async () => {
    const user = userEvent.setup();
    const onRemoveEntries = vi.fn();
    renderDirectoryTree(folderEntries, onRemoveEntries);

    const removeButtons = screen.getAllByRole("button", {
      name: /from the session \(\d+\)$/,
    });
    expect(removeButtons).toHaveLength(4);
    for (const button of removeButtons) {
      expect(button.dataset.statusDescription).toContain("from this session");
      expect(button.querySelector('img[data-icon="trash"]')).not.toBeNull();
    }
    expect(
      screen.getByRole("button", {
        name: "Copy directory path /workspace/reports",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Collapse directory /workspace/reports",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Report" })).toBeTruthy();

    await user.click(getFolderRemovalButton("/workspace/reports", 2));

    expect(onRemoveEntries).toHaveBeenCalledTimes(1);
    expect(onRemoveEntries).toHaveBeenCalledWith(["report", "daily"]);
  });

  test("uses full directory labels to distinguish same-name folders", async () => {
    const user = userEvent.setup();
    const onRemoveEntries = vi.fn();
    renderDirectoryTree(
      [
        entry("alpha-shared", "Alpha", "/workspace/alpha/shared/index.html"),
        entry("beta-shared", "Beta", "/workspace/beta/shared/index.html"),
      ],
      onRemoveEntries,
    );
    const alphaRemove = getFolderRemovalButton("/workspace/alpha/shared", 1);
    const betaRemove = getFolderRemovalButton("/workspace/beta/shared", 1);

    await user.click(alphaRemove);
    await user.click(betaRemove);

    expect(onRemoveEntries).toHaveBeenNthCalledWith(1, ["alpha-shared"]);
    expect(onRemoveEntries).toHaveBeenNthCalledWith(2, ["beta-shared"]);
  });

  test("cancels before sending a bulk removal request", async () => {
    const fetchMock = mockSessionFetch();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = await renderAppInFolderView();
    await user.click(getFolderRemovalButton("/workspace/reports", 2));

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith("Remove 2 files from this session?");
    expect(deleteRequests(fetchMock)).toHaveLength(0);
  });

  test("sends descendant IDs in one JSON request after confirmation", async () => {
    const fetchMock = mockSessionFetch();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = await renderAppInFolderView();
    await user.click(getFolderRemovalButton("/workspace/reports", 2));

    await waitFor(() => expect(deleteRequests(fetchMock)).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/session/entries", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["report", "daily"] }),
    });
    expect(confirm).toHaveBeenCalledWith("Remove 2 files from this session?");
  });

  test("uses singular wording when removing one file", async () => {
    mockSessionFetch();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = await renderAppInFolderView();
    await user.click(getFolderRemovalButton("/workspace/reports/daily", 1));

    expect(confirm).toHaveBeenCalledWith("Remove 1 file from this session?");
  });

  test("reports a failed bulk removal request", async () => {
    mockSessionFetch(false);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = await renderAppInFolderView();
    await user.click(getFolderRemovalButton("/workspace/reports", 2));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not remove the files from the session.",
    );
  });
});

function mockSessionFetch(bulkRequestSucceeds = true) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    if (input === "/api/session") {
      return Response.json({ entries: folderEntries });
    }
    return new Response(null, { status: bulkRequestSucceeds ? 204 : 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDirectoryTree(
  entries: Entry[],
  onRemoveEntries: (ids: string[]) => void,
) {
  render(
    <DirectoryTree
      entries={entries}
      selectedId={entries[0]?.id ?? null}
      onSelect={vi.fn()}
      onCopyPath={vi.fn()}
      onRemove={vi.fn()}
      onRemoveEntries={onRemoveEntries}
    />,
  );
}

async function renderAppInFolderView() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTitle("Report preview");
  await user.click(screen.getByRole("button", { name: "Folders" }));
  return user;
}

function getFolderRemovalButton(directory: string, count: number) {
  return screen.getByRole("button", {
    name: `Remove files in folder ${directory} from the session (${count})`,
  });
}

function deleteRequests(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
}
