// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
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

afterEach(cleanup);

describe("preview page search internal reset focus", () => {
  test("非表示・entry変更・unmountではfocusを移動しない", () => {
    const { rerender, unmount } = render(viewer(first, false));
    const initial = loadFrame("First preview");
    const focus = vi.spyOn(initial.button, "focus");
    const frameFocus = vi.spyOn(HTMLIFrameElement.prototype, "focus");

    openFrom(initial.button, focus, frameFocus);
    rerender(viewer(first, true));
    expect(focus).not.toHaveBeenCalled();
    expect(frameFocus).not.toHaveBeenCalled();

    rerender(viewer(first, false));
    fireEvent.load(initial.frame);
    openFrom(initial.button, focus, frameFocus);
    rerender(viewer(second, false));
    expect(focus).not.toHaveBeenCalled();
    expect(frameFocus).not.toHaveBeenCalled();

    const replacement = loadFrame("Second preview");
    const replacementFocus = vi.spyOn(replacement.button, "focus");
    openFrom(replacement.button, replacementFocus, frameFocus);
    unmount();
    expect(replacementFocus).not.toHaveBeenCalled();
    expect(frameFocus).not.toHaveBeenCalled();
  });
});

function openFrom(
  button: HTMLButtonElement,
  focus: ReturnType<typeof vi.spyOn>,
  frameFocus: ReturnType<typeof vi.spyOn>,
): void {
  button.focus();
  button.dispatchEvent(shortcut());
  focus.mockClear();
  frameFocus.mockClear();
}

function viewer(selectedEntry: Entry, isHidden: boolean) {
  return (
    <Viewer
      selectedEntry={selectedEntry}
      isHidden={isHidden}
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
    />
  );
}

function loadFrame(title: string) {
  const frame = screen.getByTitle(title) as HTMLIFrameElement;
  const document = frame.contentDocument;
  if (!document) throw new Error("preview document is unavailable");
  document.open();
  document.write("<body><button>Inside</button></body>");
  document.close();
  const button = document.querySelector("button");
  if (!button) throw new Error("preview button is unavailable");
  fireEvent.load(frame);
  return { button, frame };
}

function shortcut(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "f",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
}
