// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ChoiceDialog } from "../src/web/ChoiceDialog.js";

const options = [
  { value: "keep", label: "Keep current order" },
  { value: "sort", label: "Sort by path" },
] as const;

describe("choice dialog", () => {
  afterEach(cleanup);

  test("dialog semanticsを提供し、最初の選択肢へfocusする", () => {
    render(
      <ChoiceDialog
        title="Export session"
        description="Choose the entry order for the exported file."
        options={options}
        confirmLabel="Export"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Export session" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText(/Choose the entry order/).id).not.toBe("");
    expect(screen.getByRole("radio", { name: "Keep current order" })).toBe(
      document.activeElement,
    );
  });

  test("Escapeでcancelし、Tabをdialog内に閉じ込める", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ChoiceDialog
        title="Export session"
        description="Choose the entry order for the exported file."
        options={options}
        confirmLabel="Export"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Export" })).toBe(
      document.activeElement,
    );
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test("選択した値をconfirmへ渡す", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ChoiceDialog
        title="Export session"
        description="Choose the entry order for the exported file."
        options={options}
        confirmLabel="Export"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Sort by path" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(onConfirm).toHaveBeenCalledWith("sort");
  });
});
