// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { confirmDialog, DialogHost, promptDialog } from "../src/web/dialogs.js";

const deleteOptions = {
  title: "Delete workspace",
  message: "Delete workspace “Notes”?",
  confirmLabel: "Delete",
  tone: "danger",
} as const;

function open<T>(request: () => Promise<T>): Promise<T> {
  let pending!: Promise<T>;
  act(() => {
    pending = request();
  });
  return pending;
}

describe("in-page dialogs", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("確定ボタンでtrueを返し、削除系の見た目を付ける", async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const result = open(() => confirmDialog(deleteOptions));

    const dialog = screen.getByRole("dialog", { name: "Delete workspace" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-tone")).toBe("danger");
    expect(screen.getByRole("button", { name: "Cancel" })).toBe(
      document.activeElement,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await expect(result).resolves.toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Escapeとダイアログ外のclickでfalseを返す", async () => {
    const user = userEvent.setup();
    render(<DialogHost />);

    const byEscape = open(() => confirmDialog(deleteOptions));
    await user.keyboard("{Escape}");
    await expect(byEscape).resolves.toBe(false);

    const byBackdrop = open(() => confirmDialog(deleteOptions));
    await user.click(screen.getByRole("button", { name: "Cancel dialog" }));
    await expect(byBackdrop).resolves.toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("入力欄に初期値を選択状態で入れ、Enterで値を返す", async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const result = open(() =>
      promptDialog({
        title: "Rename workspace",
        message: "Rename “Notes”.",
        label: "Workspace name",
        confirmLabel: "Rename",
        defaultValue: "Notes",
      }),
    );

    const field = screen.getByRole("textbox", { name: "Workspace name" });
    expect(field).toBe(document.activeElement);
    await user.keyboard("Ideas{Enter}");

    await expect(result).resolves.toBe("Ideas");
  });

  test("入力をキャンセルするとnullを返す", async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const result = open(() =>
      promptDialog({
        title: "New workspace",
        message: "Create a workspace.",
        label: "Workspace name",
        confirmLabel: "Create",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(result).resolves.toBeNull();
  });

  test("別のダイアログを開くと表示中の要求をキャンセル扱いにする", async () => {
    render(<DialogHost />);
    const first = open(() => confirmDialog(deleteOptions));
    const second = open(() =>
      confirmDialog({ ...deleteOptions, title: "Clear all" }),
    );

    await expect(first).resolves.toBe(false);
    expect(screen.getByRole("dialog", { name: "Clear all" })).toBeTruthy();
    await userEvent.setup().keyboard("{Escape}");
    await expect(second).resolves.toBe(false);
  });

  test("閉じるアニメーションの終了を待ってから結果を返す", async () => {
    const user = userEvent.setup();
    const original = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = original(element);
      if (element.getAttribute("role") === "dialog")
        Object.defineProperty(style, "animationName", {
          value: "choice-dialog-pop-out",
        });
      return style;
    });
    render(<DialogHost />);
    const settled = vi.fn();
    void open(() => confirmDialog(deleteOptions)).then(settled);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete workspace" });
    expect(dialog.closest("[data-state]")?.getAttribute("data-state")).toBe(
      "closing",
    );
    expect(settled).not.toHaveBeenCalled();

    act(() => {
      fireEvent.animationEnd(dialog);
    });
    await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
