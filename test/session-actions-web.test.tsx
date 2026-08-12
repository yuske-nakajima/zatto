// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SessionActions } from "../src/web/SessionActions.js";

describe("session actions", () => {
  afterEach(cleanup);

  test("通常時は視覚区切りを挟んでimportとexportを横一列に表示する", () => {
    const { container } = render(
      <SessionActions
        isAvailable
        pending={null}
        onImport={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText<HTMLInputElement>("Import session file").disabled,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Export session…",
      }).disabled,
    ).toBe(false);
    const separator = container.querySelector(".session-action-separator");
    expect(separator?.textContent).toBe("•");
    expect(separator?.getAttribute("aria-hidden")).toBe("true");
  });

  test("初期読込中はspinnerとloadingだけを表示する", () => {
    const { container } = render(
      <SessionActions
        isAvailable={false}
        pending={null}
        onImport={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("loading…");
    expect(container.querySelector(".session-action-spinner")).toBeTruthy();
    expect(screen.queryByLabelText("Import session file")).toBeNull();
    expect(screen.queryByRole("button", { name: /Export session/ })).toBeNull();
  });

  test("import中はspinner付き状態と区切りとdisabled exportを表示する", () => {
    const { container } = render(
      <SessionActions
        isAvailable
        pending="import"
        onImport={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const importing = screen.getByText("Importing…");
    expect(importing.tagName).toBe("EM");
    expect(importing.closest("label")?.getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(container.querySelector(".session-action-spinner")).toBeTruthy();
    expect(
      container
        .querySelector(".session-action-separator")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Export session…",
      }).disabled,
    ).toBe(true);
  });

  test("export中はExporting表示にして両方の操作を無効化する", () => {
    render(
      <SessionActions
        isAvailable
        pending="export"
        onImport={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("Exporting…")).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>("Import session file").disabled,
    ).toBe(true);
  });

  test("importをcancelするとrequestせず同じfileを再選択できる", async () => {
    const onImport = vi.fn();
    const user = userEvent.setup();
    render(
      <SessionActions
        isAvailable
        pending={null}
        onImport={onImport}
        onExport={vi.fn()}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>(
      "Import session file",
    );
    const file = new File(["{}"], "session.json", {
      type: "application/json",
    });

    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onImport).not.toHaveBeenCalled();
    expect(input).toBe(document.activeElement);
    await user.upload(input, file);
    expect(screen.getByRole("dialog", { name: "Import session" })).toBeTruthy();
  });

  test("exportをcancelするとrequestせずtriggerへfocusを戻す", async () => {
    const onExport = vi.fn();
    const user = userEvent.setup();
    render(
      <SessionActions
        isAvailable
        pending={null}
        onImport={vi.fn()}
        onExport={onExport}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Export session…" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(onExport).not.toHaveBeenCalled();
    expect(trigger).toBe(document.activeElement);
  });

  test("transfer完了後にtriggerへfocusを戻す", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const { rerender } = render(
      <SessionActions
        isAvailable
        pending={null}
        onImport={vi.fn()}
        onExport={onExport}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Export session…" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    rerender(
      <SessionActions
        isAvailable
        pending="export"
        onImport={vi.fn()}
        onExport={onExport}
      />,
    );
    rerender(
      <SessionActions
        isAvailable
        pending={null}
        onImport={vi.fn()}
        onExport={onExport}
      />,
    );

    expect(screen.getByRole("button", { name: "Export session…" })).toBe(
      document.activeElement,
    );
  });
});
