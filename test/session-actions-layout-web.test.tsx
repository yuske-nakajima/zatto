// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { type ComponentProps, createRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FilePanel } from "../src/web/FilePanel.js";

const baseProps = {
  entries: [],
  selectedId: null,
  view: "list",
  draggedId: null,
  dropTargetId: null,
  canPickFiles: false,
  isFilePickerOpen: false,
  sessionTransferPending: null,
  isSessionLoaded: true,
  isSearchVisible: false,
  hasSearchState: false,
  searchButtonRef: createRef<HTMLButtonElement>(),
  onViewChange: vi.fn(),
  onClear: vi.fn(),
  onSelect: vi.fn(),
  onCopyPath: vi.fn(),
  onRemove: vi.fn(),
  onRemoveEntries: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnter: vi.fn(),
  onDragEnd: vi.fn(),
  onDrop: vi.fn(),
  onPickFiles: vi.fn(),
  onOpenSearch: vi.fn(),
  onImportSession: vi.fn(),
  onExportSession: vi.fn(),
} satisfies ComponentProps<typeof FilePanel>;

describe("session action shelf layout", () => {
  afterEach(cleanup);

  test("listとemptyのスクロール領域より後に操作棚を配置する", () => {
    render(<FilePanel {...baseProps} />);

    const actions = screen.getByRole("region", {
      name: "Session file management",
    });
    const scrollRegion = actions.previousElementSibling;
    expect(scrollRegion?.classList).toContain("sidebar-scroll-region");
    expect(scrollRegion?.querySelector(".entry-list")).toBe(
      screen.getByRole("list", { name: "HTML entries" }),
    );
    expect(scrollRegion?.querySelector(".empty-list")).toBeTruthy();
  });

  test("folder treeを操作棚と分離したスクロール領域に配置する", () => {
    render(
      <FilePanel
        {...baseProps}
        view="directories"
        entries={[
          {
            id: "entry",
            title: "Entry",
            absPath: "/work/entry.html",
            addedAt: 1,
          },
        ]}
      />,
    );

    expect(
      screen
        .getByRole("navigation", { name: "HTML entries by folder" })
        .closest(".sidebar-scroll-region"),
    ).toBeTruthy();
  });

  test("220px幅で操作とwarningを折り返し、motion軽減時はspinnerを停止する", () => {
    const styles = readFileSync(resolve("src/web/styles.css"), "utf8");

    expect(styles).toMatch(
      /\.session-action-buttons\s*{[\s\S]*?flex-wrap:\s*wrap/,
    );
    expect(styles).toMatch(
      /\.session-actions\s*>\s*p\s*{[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?color:\s*var\(--color-text-secondary\)/,
    );
    expect(styles).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.session-action-spinner\s*{[\s\S]*?animation:\s*none/,
    );
    expect(styles).toMatch(
      /\.choice-dialog-overlay\s*{[\s\S]*?position:\s*fixed[\s\S]*?z-index:\s*20[\s\S]*?inset:\s*0/,
    );
    expect(styles).toMatch(
      /\.choice-dialog-backdrop\s*{[\s\S]*?position:\s*absolute[\s\S]*?inset:\s*0/,
    );
  });
});
