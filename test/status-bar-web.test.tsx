// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";

const statusBarStyles = readFileSync(resolve("src/web/status-bar.css"), "utf8");
const entries: Entry[] = [
  {
    id: "alpha",
    title: "Alpha",
    absPath: "/work/alpha.html",
    addedAt: 1,
  },
];

class FakeWebSocket extends EventTarget {
  close(): void {
    this.dispatchEvent(new Event("close"));
  }
}

describe("操作説明ステータスバー", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("メイン領域と独立した左右領域を画面下部に常設する", async () => {
    const { container } = render(<App />);
    await screen.findByTitle("Alpha preview");

    const statusBar = screen.getByRole("region", {
      name: "Status bar",
    });
    expect(statusBar.querySelector(".status-bar-left")?.textContent).toBe(
      "?Docs",
    );
    expect(
      statusBar.querySelector(".status-bar-description")?.textContent,
    ).toBe("");
    expect(container.querySelector(".app-frame > .app-shell")).toBeTruthy();
    expect(container.querySelector(".app-frame > .status-bar")).toBe(statusBar);
  });

  test("ポインターとキーボードフォーカスに応じて説明を切り替える", async () => {
    render(<App />);
    await screen.findByTitle("Alpha preview");
    const description = document.querySelector(".status-bar-description");
    const list = screen.getByRole("button", { name: "List" });
    const folders = screen.getByRole("button", { name: "Folders" });

    fireEvent.pointerOver(list);
    expect(description?.textContent).toBe("Show files in list order.");

    fireEvent.focus(folders);
    expect(description?.textContent).toBe("Group files by folder.");

    fireEvent.blur(folders, { relatedTarget: document.body });
    expect(description?.textContent).toBe("");

    fireEvent.pointerOver(list);
    fireEvent.pointerOut(list, { relatedTarget: document.body });
    expect(description?.textContent).toBe("");
  });

  test("ファイルパネル、検索、プレビューの操作要素を説明対象にする", async () => {
    render(<App />);
    await screen.findByTitle("Alpha preview");

    const targets = [
      screen.getByRole("button", { name: "Search" }),
      screen.getByRole("button", { name: "Open Alpha" }),
      screen.getByRole("button", { name: "Reorder Alpha" }),
      screen.getByRole("separator", { name: "Resize file panel" }),
      screen.getByRole("button", { name: "Hide file panel" }),
      screen.getByRole("button", { name: "Copy file path" }),
      screen.getByRole("button", { name: "Docs" }),
    ];

    for (const target of targets) {
      expect(target.getAttribute("data-status-description")).toBeTruthy();
    }
    expect(
      screen
        .getByTitle("Alpha preview")
        .getAttribute("data-status-description"),
    ).toBeNull();
  });

  test("固定寸法、省略、控えめなフェードをCSSで定義する", () => {
    expect(statusBarStyles).toMatch(
      /\.app-frame\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\) 21px/s,
    );
    expect(statusBarStyles).toMatch(/\.status-bar\s*{[^}]*height:\s*21px/s);
    expect(statusBarStyles).toMatch(/\.status-bar\s*{[^}]*font-size:\s*10px/s);
    expect(statusBarStyles).toMatch(
      /\.status-bar-description\s*{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
    );
    expect(statusBarStyles).toMatch(
      /\.status-bar-description > span\s*{[^}]*animation:\s*status-description-fade 125ms/s,
    );
  });
});
