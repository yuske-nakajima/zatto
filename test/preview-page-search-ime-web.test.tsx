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

describe("preview page search IME input", () => {
  test("日本語変換中のEnterとEscapeを検索移動や終了として処理しない", () => {
    renderViewer();
    const document = loadPreview("<p>日本語 日本</p>");
    document.dispatchEvent(shortcut());
    const input = screen.getByRole("searchbox", { name: "Find in preview" });

    fireEvent.compositionStart(input, { data: "" });
    fireEvent.compositionUpdate(input, { data: "にほん" });
    fireEvent.change(input, { target: { value: "日本" } });
    expect((input as HTMLInputElement).value).toBe("日本");
    expect(screen.getByText("1 / 2")).toBeTruthy();

    const composingEnter = keydown("Enter", { isComposing: true });
    fireEvent(input, composingEnter);
    expect(composingEnter.defaultPrevented).toBe(false);
    expect(screen.getByText("1 / 2")).toBeTruthy();

    const composingEscape = keydown("Escape", { isComposing: true });
    fireEvent(input, composingEscape);
    expect(composingEscape.defaultPrevented).toBe(false);
    expect(
      screen.getByRole("search", { name: "Find in preview" }),
    ).toBeTruthy();

    fireEvent.compositionEnd(input, { data: "日本" });
    const enter = keydown("Enter");
    fireEvent(input, enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(screen.getByText("2 / 2")).toBeTruthy();

    const normalEscape = keydown("Escape");
    fireEvent(input, normalEscape);
    expect(normalEscape.defaultPrevented).toBe(true);
    expect(
      screen.queryByRole("search", { name: "Find in preview" }),
    ).toBeNull();
  });

  test("SafariでIME確定直後のEnterとEscapeを検索移動や終了として処理しない", () => {
    renderViewer();
    const document = loadPreview("<p>日本語 日本</p>");
    document.dispatchEvent(shortcut());
    const input = screen.getByRole("searchbox", { name: "Find in preview" });
    fireEvent.change(input, { target: { value: "日本" } });
    expect(screen.getByText("1 / 2")).toBeTruthy();

    const imeBoundaryEnter = keydown("Enter", {
      isComposing: false,
      keyCode: 229,
    });
    fireEvent(input, imeBoundaryEnter);
    expect(imeBoundaryEnter.defaultPrevented).toBe(false);
    expect(screen.getByText("1 / 2")).toBeTruthy();

    const imeBoundaryEscape = keydown("Escape", {
      isComposing: false,
      keyCode: 229,
    });
    fireEvent(input, imeBoundaryEscape);
    expect(imeBoundaryEscape.defaultPrevented).toBe(false);
    expect(
      screen.getByRole("search", { name: "Find in preview" }),
    ).toBeTruthy();
  });
});

function renderViewer(): void {
  render(
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

function loadPreview(html: string): Document {
  const frame = screen.getByTitle("First preview") as HTMLIFrameElement;
  const document = frame.contentDocument;
  if (!document) throw new Error("preview document is unavailable");
  document.open();
  document.write(`<body>${html}</body>`);
  document.close();
  const view = document.defaultView;
  if (!view) throw new Error("preview window is unavailable");
  Object.defineProperty(view, "Highlight", { value: class Highlight {} });
  Object.defineProperty(view.CSS, "highlights", {
    value: new Map<string, object>(),
  });
  fireEvent.load(frame);
  return document;
}

function shortcut(): KeyboardEvent {
  return keydown("f", { metaKey: true });
}

function keydown(
  key: string,
  options: {
    isComposing?: boolean;
    keyCode?: number;
    metaKey?: boolean;
  } = {},
): KeyboardEvent {
  const { keyCode, ...eventOptions } = options;
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...eventOptions,
  });
  if (keyCode !== undefined)
    Object.defineProperty(event, "keyCode", { value: keyCode });
  return event;
}
