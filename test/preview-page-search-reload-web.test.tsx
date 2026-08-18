// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import type { SearchResultLocator } from "../src/web/search-navigation-url.js";
import { Viewer } from "../src/web/Viewer.js";

const entry: Entry = {
  id: "a",
  title: "First",
  absPath: "/work/first.html",
  addedAt: 1,
};
const target: SearchResultLocator = {
  entryId: "a",
  lineNumber: 1,
  offset: 6,
  length: 5,
  ordinal: 0,
  matchText: null,
  prefix: "first ",
  suffix: " tail",
};

afterEach(cleanup);

describe("preview page search reload", () => {
  test("差し替え時に旧documentを解除しload後に検索だけを復元する", () => {
    const { rerender } = renderViewer(0);
    const initial = writeFrame("<p id='target'>first alpha tail</p>");
    const oldHighlights = installHighlightApi(initial.document);
    const targetElement =
      initial.document.querySelector<HTMLElement>("#target");
    if (targetElement) targetElement.scrollIntoView = vi.fn();
    fireEvent.load(initial.frame);
    expect(initial.document.getSelection()?.toString()).toBe("alpha");

    initial.document.dispatchEvent(shortcut());
    const input = screen.getByRole<HTMLInputElement>("searchbox", {
      name: "Find in preview",
    });
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(oldHighlights.size).toBe(2);

    rerender(viewer(1));
    const staleShortcut = shortcut();
    initial.document.dispatchEvent(staleShortcut);
    expect(staleShortcut.defaultPrevented).toBe(false);
    expect(oldHighlights.size).toBe(0);
    expect(
      initial.document.querySelector("[data-zatto-page-search-styles]"),
    ).toBeNull();
    expect(input.value).toBe("alpha");

    const reloaded = writeFrame("<p>alpha one</p><p>alpha two</p>");
    const newHighlights = installHighlightApi(reloaded.document);
    for (const element of reloaded.document.querySelectorAll<HTMLElement>(
      "p",
    )) {
      element.scrollIntoView = vi.fn();
    }
    fireEvent.load(reloaded.frame);
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(newHighlights.size).toBe(2);
    expect(reloaded.document.getSelection()?.toString()).toBe("");
  });
});

function renderViewer(reloadVersion: number) {
  return render(viewer(reloadVersion));
}

function viewer(reloadVersion: number) {
  return (
    <Viewer
      selectedEntry={entry}
      previewTarget={target}
      searchQuery="alpha"
      reloadVersion={reloadVersion}
      isFilePanelVisible={true}
      errorMessage={null}
      copyFeedback={null}
      canPickFiles={false}
      isFilePickerOpen={false}
      onToggleFilePanel={vi.fn()}
      onCopyPath={vi.fn()}
      onRemove={vi.fn()}
      onPickFiles={vi.fn()}
    />
  );
}

function writeFrame(html: string) {
  const frame = screen.getByTitle("First preview") as HTMLIFrameElement;
  const document = frame.contentDocument;
  if (!document) throw new Error("preview document is unavailable");
  document.open();
  document.write(`<body>${html}</body>`);
  document.close();
  return { frame, document };
}

function installHighlightApi(document: Document): Map<string, object> {
  const highlights = new Map<string, object>();
  const view = document.defaultView;
  if (!view) throw new Error("preview window is unavailable");
  Object.defineProperty(view, "Highlight", { value: class Highlight {} });
  Object.defineProperty(view.CSS, "highlights", { value: highlights });
  return highlights;
}

function shortcut(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "f",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
}
