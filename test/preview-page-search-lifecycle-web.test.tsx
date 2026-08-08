// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import type { SearchResultLocator } from "../src/web/search-navigation-url.js";
import { Viewer } from "../src/web/Viewer.js";

const first: Entry = {
  id: "a",
  title: "First",
  absPath: "/work/first.html",
  addedAt: 1,
};
const second: Entry = {
  id: "b",
  title: "Second",
  absPath: "/work/second.html",
  addedAt: 2,
};
const target: SearchResultLocator = {
  entryId: "a",
  lineNumber: 1,
  offset: 9,
  length: 5,
  ordinal: 0,
  matchText: null,
  prefix: "first ",
  suffix: " tail",
};

afterEach(cleanup);

describe("preview page search lifecycle", () => {
  test("reloadごとにkeydown listenerを付け直しunmountで解除する", () => {
    const { unmount } = render(viewer(first));
    const { frame, document } = writeFrame("First preview", "<p>alpha</p>");
    installHighlightApi(document);
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");

    fireEvent.load(frame);
    fireEvent.load(frame);
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(
      2,
    );
    expect(
      remove.mock.calls.filter(([type]) => type === "keydown"),
    ).toHaveLength(2);
    document.dispatchEvent(shortcut());
    expect(
      screen.getByRole("search", { name: "Find in preview" }),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find in preview" }),
      { target: { value: "alpha" } },
    );
    document.body.innerHTML = "<p>beta</p>";
    fireEvent.load(frame);
    expect(screen.getByText("0 / 0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close page search" }));
    unmount();
    const afterUnmount = shortcut();
    document.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });

  test("previewTarget選択と競合せずentry変更で古い状態を解除する", () => {
    const { rerender } = render(viewer(first, target));
    const loaded = writeFrame(
      "First preview",
      "<p id='target'>first alpha tail</p>",
    );
    const highlights = installHighlightApi(loaded.document);
    const targetElement = loaded.document.querySelector<HTMLElement>("#target");
    if (targetElement) targetElement.scrollIntoView = vi.fn();
    fireEvent.load(loaded.frame);
    expect(loaded.document.getSelection()?.toString()).toBe("alpha");

    loaded.document.dispatchEvent(shortcut());
    expect(loaded.document.getSelection()?.toString()).toBe("");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find in preview" }),
      {
        target: { value: "alpha" },
      },
    );
    expect(highlights.size).toBe(2);

    rerender(viewer(second));
    expect(
      screen.queryByRole("search", { name: "Find in preview" }),
    ).toBeNull();
    expect(highlights.size).toBe(0);
    const staleShortcut = shortcut();
    loaded.document.dispatchEvent(staleShortcut);
    expect(staleShortcut.defaultPrevented).toBe(false);
  });

  test("Highlight API未対応時は利用不能としqueryのsurrogateを分断しない", () => {
    render(viewer(first));
    const { frame, document } = writeFrame("First preview", "<p>alpha</p>");
    fireEvent.load(frame);
    document.dispatchEvent(shortcut());
    const input = screen.getByRole("searchbox", { name: "Find in preview" });
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(screen.getByText("Unavailable")).toBeTruthy();

    fireEvent.change(input, {
      target: { value: `${"a".repeat(255)}😀` },
    });
    expect((input as HTMLInputElement).value).toBe("a".repeat(255));
  });

  test("Highlight registryのアクセス失敗を利用不能として安全に解除する", () => {
    render(viewer(first));
    const { frame, document } = writeFrame("First preview", "<p>alpha</p>");
    const view = document.defaultView;
    if (!view) throw new Error("preview window is unavailable");
    Object.defineProperty(view, "Highlight", { value: class Highlight {} });
    Object.defineProperty(view.CSS, "highlights", {
      value: {
        set: () => {
          throw new Error("registry access failed");
        },
        delete: () => {
          throw new Error("registry access failed");
        },
      },
    });
    fireEvent.load(frame);
    document.dispatchEvent(shortcut());
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find in preview" }),
      { target: { value: "alpha" } },
    );
    expect(screen.getByText("Unavailable")).toBeTruthy();
    const injectedStyle = document.querySelector(
      "[data-zatto-page-search-styles]",
    );
    expect(injectedStyle).toBeNull();
  });
});

function viewer(
  selectedEntry: Entry,
  previewTarget: SearchResultLocator | null = null,
) {
  return (
    <Viewer
      selectedEntry={selectedEntry}
      previewTarget={previewTarget}
      searchQuery={previewTarget ? "alpha" : ""}
      reloadVersion={0}
      isFilePanelVisible={true}
      errorMessage={null}
      copyFeedback={null}
      canPickFiles={false}
      isFilePickerOpen={false}
      onToggleFilePanel={vi.fn()}
      onCopyPath={vi.fn()}
      onPickFiles={vi.fn()}
    />
  );
}

function writeFrame(title: string, html: string) {
  const frame = screen.getByTitle(title) as HTMLIFrameElement;
  const document = frame.contentDocument;
  if (!document) throw new Error("preview document is unavailable");
  document.open();
  document.write(`<body>${html}</body>`);
  document.close();
  return { frame, document };
}

function installHighlightApi(document: Document): Map<string, object> {
  const highlights = new Map<string, object>();
  class Highlight {}
  const view = document.defaultView;
  if (!view) throw new Error("preview window is unavailable");
  Object.defineProperty(view, "Highlight", {
    configurable: true,
    value: Highlight,
  });
  Object.defineProperty(view.CSS, "highlights", {
    configurable: true,
    value: highlights,
  });
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
