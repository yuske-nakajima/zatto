// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { Viewer } from "../src/web/Viewer.js";

const entry: Entry = {
  id: "a",
  title: "First",
  absPath: "/work/first.html",
  addedAt: 1,
};

afterEach(cleanup);

describe("preview page search interaction", () => {
  test("captureでshortcutを受け取り同じoptionsでlistenerを解除する", () => {
    const { unmount } = renderViewer();
    const { frame, document } = writeFrame(
      "<button id='inside'>Inside</button>",
    );
    installHighlightApi(document);
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    fireEvent.load(frame);
    const button = document.querySelector<HTMLButtonElement>("#inside");
    if (!button) throw new Error("preview button is unavailable");
    button.addEventListener("keydown", (event) => event.stopPropagation());

    const event = shortcut();
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(
      screen.getByRole("search", { name: "Find in preview" }),
    ).toBeTruthy();
    const addCall = add.mock.calls
      .filter(([type]) => type === "keydown")
      .at(-1);
    expect(addCall?.[2]).toEqual({ capture: true });

    unmount();
    const removeCall = remove.mock.calls
      .filter(([type]) => type === "keydown")
      .at(-1);
    expect(removeCall?.[2]).toBe(addCall?.[2]);
  });

  test("EscapeとCloseでshortcut前のiframe内要素へfocusを戻す", () => {
    renderViewer();
    const { frame, document } = loadFrame(
      "<button id='first'>First</button><button id='second'>Second</button>",
    );
    const first = document.querySelector<HTMLButtonElement>("#first");
    const second = document.querySelector<HTMLButtonElement>("#second");
    if (!first || !second) throw new Error("preview buttons are unavailable");
    const firstFocus = vi.spyOn(first, "focus");
    first.focus();
    first.dispatchEvent(shortcut());
    firstFocus.mockClear();
    fireEvent.keyDown(
      screen.getByRole("searchbox", { name: "Find in preview" }),
      { key: "Escape" },
    );
    expect(firstFocus).toHaveBeenCalledOnce();

    const secondFocus = vi.spyOn(second, "focus");
    second.focus();
    second.dispatchEvent(shortcut());
    secondFocus.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Close page search" }));
    expect(secondFocus).toHaveBeenCalledOnce();

    second.remove();
    const frameFocus = vi.spyOn(frame, "focus");
    document.dispatchEvent(shortcut());
    fireEvent.click(screen.getByRole("button", { name: "Close page search" }));
    expect(frameFocus).toHaveBeenCalledOnce();
  });

  test("検索UIの文言・移動方向・区切りを表示する", () => {
    renderViewer();
    const { document } = loadFrame("<p>alpha</p>");
    document.dispatchEvent(shortcut());
    expect(screen.getByPlaceholderText("Find in page...")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Previous match" }).textContent,
    ).toBe("↑");
    expect(screen.getByRole("button", { name: "Next match" }).textContent).toBe(
      "↓",
    );
    expect(document.querySelectorAll(".page-search-divider")).toHaveLength(0);
    expect(
      window.document.querySelectorAll(".page-search-divider"),
    ).toHaveLength(2);
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
      onRemove={vi.fn()}
      onPickFiles={vi.fn()}
    />,
  );
}

function loadFrame(html: string) {
  const loaded = writeFrame(html);
  installHighlightApi(loaded.document);
  fireEvent.load(loaded.frame);
  return loaded;
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

function installHighlightApi(document: Document): void {
  const view = document.defaultView;
  if (!view) throw new Error("preview window is unavailable");
  Object.defineProperty(view, "Highlight", { value: class Highlight {} });
  Object.defineProperty(view.CSS, "highlights", {
    value: new Map<string, object>(),
  });
}

function shortcut(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "f",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
}
