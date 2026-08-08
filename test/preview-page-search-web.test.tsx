// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { Viewer } from "../src/web/Viewer.js";

interface FakeHighlight {
  ranges: Range[];
}

const entry: Entry = {
  id: "a",
  title: "First",
  absPath: "/work/first.html",
  addedAt: 1,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("preview page search", () => {
  test("iframe内のCmd+FとCtrl+Fだけを処理し、inputへfocusする", () => {
    renderViewer();
    const { document } = loadPreview("<p>alpha</p>");
    const parentShortcut = shortcut("f", { ctrlKey: true });
    window.dispatchEvent(parentShortcut);
    expect(parentShortcut.defaultPrevented).toBe(false);
    expect(
      screen.queryByRole("search", { name: "Find in preview" }),
    ).toBeNull();

    const commandShortcut = shortcut("f", { metaKey: true });
    document.dispatchEvent(commandShortcut);
    expect(commandShortcut.defaultPrevented).toBe(true);
    expect(screen.getByRole("searchbox", { name: "Find in preview" })).toBe(
      window.document.activeElement,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close page search" }));
    const controlShortcut = shortcut("F", { ctrlKey: true });
    document.dispatchEvent(controlShortcut);
    expect(controlShortcut.defaultPrevented).toBe(true);
    expect(
      screen.getByRole("search", { name: "Find in preview" }),
    ).toBeTruthy();
  });

  test("可視一致を数えて移動・循環し、0件と空queryを表示する", () => {
    renderViewer();
    const { document, highlights } = loadPreview(`
      <p id="first">Alpha one</p>
      <script type="application/json">"alpha"</script>
      <p hidden>alpha</p>
      <p id="second">alpha two</p>
    `);
    const first = document.querySelector<HTMLElement>("#first");
    const second = document.querySelector<HTMLElement>("#second");
    if (first) first.scrollIntoView = vi.fn();
    if (second) second.scrollIntoView = vi.fn();
    document.dispatchEvent(shortcut("f", { metaKey: true }));
    const input = screen.getByRole("searchbox", { name: "Find in preview" });

    fireEvent.change(input, { target: { value: "alpha" } });
    expect(
      screen.getByRole("status", { name: "Page search matches" }).textContent,
    ).toBe("1 / 2");
    expect(highlights.get("zatto-page-search-matches")?.ranges).toHaveLength(2);
    expect(highlights.get("zatto-page-search-current")?.ranges).toHaveLength(1);
    expect(first?.scrollIntoView).toHaveBeenLastCalledWith({ block: "center" });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("2 / 2")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByText("2 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("2 / 2")).toBeTruthy();

    fireEvent.change(input, { target: { value: "missing" } });
    const count = screen.getByRole("status", { name: "Page search matches" });
    expect(count.textContent).toBe("0 / 0");
    expect(count.classList).toContain("page-search-count--empty");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next match" })
        .disabled,
    ).toBe(true);
    fireEvent.change(input, { target: { value: "" } });
    expect(count.textContent).toBe("");
  });

  test("EscapeとCloseでhighlightだけを解除し、ユーザーselectionを維持する", () => {
    renderViewer();
    const { document, highlights } = loadPreview(
      "<p>alpha</p><p id='user'>keep</p>",
    );
    const userText = document.querySelector("#user")?.firstChild;
    const selection = document.getSelection();
    if (userText && selection) {
      const range = document.createRange();
      range.selectNodeContents(userText);
      selection.addRange(range);
    }
    document.dispatchEvent(shortcut("f", { metaKey: true }));
    const input = screen.getByRole("searchbox", { name: "Find in preview" });
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("search", { name: "Find in preview" }),
    ).toBeNull();
    expect(highlights.size).toBe(0);
    expect(selection?.toString()).toBe("keep");

    document.dispatchEvent(shortcut("f", { ctrlKey: true }));
    fireEvent.click(screen.getByRole("button", { name: "Close page search" }));
    expect(highlights.size).toBe(0);
    expect(selection?.toString()).toBe("keep");
  });
});

function renderViewer() {
  return render(
    <Viewer
      selectedEntry={entry}
      reloadVersion={0}
      isFilePanelVisible={true}
      errorMessage={null}
      copyFeedback={null}
      canPickFiles={false}
      isFilePickerOpen={false}
      onToggleFilePanel={vi.fn()}
      onCopyPath={vi.fn()}
      onPickFiles={vi.fn()}
    />,
  );
}

function loadPreview(html: string) {
  const frame = screen.getByTitle("First preview") as HTMLIFrameElement;
  const document = frame.contentDocument;
  if (!document) throw new Error("preview document is unavailable");
  document.open();
  document.write(`<body>${html}</body>`);
  document.close();
  const highlights = installHighlightApi(document);
  fireEvent.load(frame);
  return { document, highlights };
}

function installHighlightApi(document: Document): Map<string, FakeHighlight> {
  const highlights = new Map<string, FakeHighlight>();
  class Highlight implements FakeHighlight {
    ranges: Range[];

    constructor(...ranges: Range[]) {
      this.ranges = ranges;
    }
  }
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

function shortcut(
  key: string,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean },
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
}
