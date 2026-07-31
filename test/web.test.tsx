// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App, groupEntriesByDirectory, moveEntry } from "../src/web/App.js";

const webStyles = readFileSync(resolve("src/web/styles.css"), "utf8");
const hiddenPanelRule =
  webStyles.match(/\.app-shell--panel-hidden\s*{[^}]*}/)?.[0] ?? "";
const webStyleElement = document.createElement("style");
webStyleElement.textContent = hiddenPanelRule;
document.head.append(webStyleElement);

class FakeWebSocket extends EventTarget {
  static instance: FakeWebSocket | null = null;

  constructor(_url: string | URL) {
    super();
    FakeWebSocket.instance = this;
  }

  close(): void {
    this.dispatchEvent(new Event("close"));
  }

  emitMessage(message: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }
}

function entry(id: string, title: string, absPath = `/tmp/${id}.html`): Entry {
  return {
    id,
    title,
    absPath,
    addedAt: 1,
  };
}

describe("App", () => {
  const initialEntries = [entry("a", "Alpha"), entry("b", "Bravo")];
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    FakeWebSocket.instance = null;
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: initialEntries })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("先頭を自動選択し、クリックでビューを切り替える", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const firstFrame = await screen.findByTitle("Alpha preview");
    expect(firstFrame.getAttribute("src")).toBe("/f/a/");
    expect(screen.getByRole("img", { name: "zatto" })).toBeTruthy();
    expect(container.querySelector(".connection-dot")).toBeNull();
    expect(container.querySelector(".window-controls")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open Bravo" }));
    expect(screen.getByTitle("Bravo preview").getAttribute("src")).toBe(
      "/f/b/",
    );
  });

  test("合流更新で選択を維持し、表示中の変更だけ再読込する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");
    await user.click(screen.getByRole("button", { name: "Open Bravo" }));

    const selectedFrame = screen.getByTitle("Bravo preview");
    act(() => {
      FakeWebSocket.instance?.emitMessage({
        type: "session:update",
        entries: [...initialEntries, entry("c", "Charlie")],
      });
    });
    expect(screen.getByTitle("Bravo preview")).toBe(selectedFrame);
    expect(screen.getByText("Charlie")).toBeTruthy();

    act(() => {
      FakeWebSocket.instance?.emitMessage({ type: "file:changed", id: "a" });
    });
    expect(screen.getByTitle("Bravo preview")).toBe(selectedFrame);

    act(() => {
      FakeWebSocket.instance?.emitMessage({ type: "file:changed", id: "b" });
    });
    expect(screen.getByTitle("Bravo preview")).not.toBe(selectedFrame);
  });

  test("個別削除と確認付き全削除をAPIへ送る", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Remove Alpha" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/session/a", {
      method: "DELETE",
    });
    expect(confirm).toHaveBeenCalledWith("Remove all entries?");
    expect(fetchMock).toHaveBeenCalledWith("/api/session", {
      method: "DELETE",
    });
  });

  test("表示方式を切り替えてブラウザに保存する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Folders" }));

    expect(
      screen
        .getByRole("button", { name: "Folders" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(window.localStorage.getItem("zatto:file-panel-view")).toBe(
      "directories",
    );
    expect(screen.getByTitle("Alpha preview")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reorder Alpha" })).toBeNull();
  });

  test("保存した表示方式を再読み込み時に復元する", async () => {
    window.localStorage.setItem("zatto:file-panel-view", "directories");
    render(<App />);
    await screen.findByTitle("Alpha preview");

    expect(
      screen
        .getByRole("button", { name: "Folders" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("ファイルパネルを非表示にしてビューアーを利用可能幅へ広げる", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Hide file panel" }));

    expect(screen.queryByRole("complementary")).toBeNull();
    const appShell = container.querySelector(".app-shell--panel-hidden");
    expect(appShell).not.toBeNull();
    expect(getComputedStyle(appShell as Element).gridTemplateColumns).toBe(
      "1fr",
    );
    expect(
      screen.getByRole("button", { name: "Show file panel" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show file panel" }));

    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide file panel" }),
    ).toBeTruthy();
  });

  test("狭い画面のパネル非表示時に単一のビューアー行を定義する", () => {
    expect(webStyles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.app-shell--panel-hidden\s*{[^}]*grid-template-rows:\s*minmax\(420px,\s*calc\(100vh - 24px\)\)/,
    );
  });

  test("Figma Variableと主要レイアウト寸法をCSSへ反映する", () => {
    expect(webStyles).toContain("--color-bg-app: var(--color-gray-50)");
    expect(webStyles).toContain("--color-bg-success: var(--color-emerald-500)");
    expect(webStyles).toContain(
      "--color-text-success: var(--color-emerald-600)",
    );
    expect(webStyles).toContain("--spacing-40: 40px");
    expect(webStyles).toContain("--radius-full: 9999px");
    expect(webStyles).toMatch(
      /grid-template-columns:\s*260px minmax\(0,\s*1fr\)/,
    );
    expect(webStyles).toMatch(
      /\.viewer\s*{[\s\S]*?grid-template-rows:\s*64px 1fr/,
    );
    expect(webStyles).toMatch(
      /\.viewer-canvas\s*{[\s\S]*?padding:\s*var\(--spacing-24\)/,
    );
    expect(webStyles).toMatch(
      /\.copy-feedback--success\s*{[\s\S]*?var\(--color-bg-success\) 8%/,
    );
    expect(webStyles).toMatch(/\.entry-list\s*{[\s\S]*?overflow-x:\s*hidden/);
    expect(webStyles).toMatch(/\.entry-tooltip\s*{[\s\S]*?position:\s*fixed/);
  });

  test("ファイルパネル非表示中もAPIエラーを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("session unavailable");
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Hide file panel" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not load the session.",
    );
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  test("一覧とフォルダー表示で完全なタイトルとパスをツールチップに表示する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTitle("Alpha preview");

    const listEntryButton = screen.getByRole("button", { name: "Open Alpha" });
    const listPathDescriptionId =
      listEntryButton.getAttribute("aria-describedby");
    expect(listPathDescriptionId).not.toBeNull();
    expect(
      document.getElementById(listPathDescriptionId ?? "")?.textContent,
    ).toBe("/tmp/a.html");
    expect(
      screen
        .getByRole("button", { name: "Copy file path" })
        .getAttribute("aria-describedby"),
    ).toBe("selected-file-path");
    const alphaTitle = screen.getByText("Alpha");
    vi.spyOn(alphaTitle, "getBoundingClientRect").mockReturnValue({
      bottom: 300,
      height: 16,
      left: 28,
      right: 178,
      top: 284,
      width: 150,
      x: 28,
      y: 284,
      toJSON: () => undefined,
    });
    await user.hover(alphaTitle);
    const titleTooltip = screen.getByRole("tooltip");
    expect(titleTooltip.textContent).toBe("Alpha");
    expect(titleTooltip.style.left).toBe("28px");
    expect(titleTooltip.style.top).toBe("308px");
    await user.unhover(alphaTitle);
    vi.spyOn(listEntryButton, "getBoundingClientRect").mockReturnValue({
      bottom: 320,
      height: 40,
      left: 20,
      right: 208,
      top: 280,
      width: 188,
      x: 20,
      y: 280,
      toJSON: () => undefined,
    });
    fireEvent.focus(listEntryButton);
    expect(screen.getByRole("tooltip").textContent).toBe("Alpha");
    expect(screen.getByRole("tooltip").style.left).toBe("20px");
    expect(screen.getByRole("tooltip").style.top).toBe("328px");
    fireEvent.blur(listEntryButton);
    await user.hover(screen.getByText("a.html"));
    expect(screen.getByRole("tooltip").textContent).toBe("/tmp/a.html");
    await user.unhover(screen.getByText("a.html"));
    fireEvent.focus(
      screen.getByText("/tmp/a.html", { selector: ".selected-path p" }),
    );
    expect(screen.getByRole("tooltip").textContent).toBe("/tmp/a.html");
    fireEvent.blur(
      screen.getByText("/tmp/a.html", { selector: ".selected-path p" }),
    );

    await user.click(screen.getByRole("button", { name: "Folders" }));

    const folderEntryButton = screen.getByRole("button", {
      name: "Open Alpha",
    });
    expect(
      document.getElementById(
        folderEntryButton.getAttribute("aria-describedby") ?? "",
      )?.textContent,
    ).toBe("/tmp/a.html");
    await user.hover(screen.getByText("Alpha"));
    expect(screen.getByRole("tooltip").textContent).toBe("Alpha");
  });

  test("未選択時の固定文言にはツールチップを付けない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: [] })),
    );
    render(<App />);

    const emptyPath = await screen.findByText("NO FILE SELECTED");
    expect(emptyPath.getAttribute("title")).toBeNull();
  });

  test("選択中のファイルパスをコピーして成功を表示する", async () => {
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Copy file path" }));

    expect(writeText).toHaveBeenCalledWith("/tmp/a.html");
    expect((await screen.findByRole("status")).textContent).toBe(
      "Path copied!",
    );
  });

  test("Listの未選択ファイルを選択変更せずにコピーする", async () => {
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<App />);
    const selectedFrame = await screen.findByTitle("Alpha preview");

    await user.click(
      screen.getByRole("button", {
        name: "Copy file path /tmp/b.html",
      }),
    );

    expect(writeText).toHaveBeenCalledWith("/tmp/b.html");
    expect(screen.getByTitle("Alpha preview")).toBe(selectedFrame);
    expect((await screen.findByRole("status")).textContent).toBe(
      "Path copied!",
    );
  });

  test("Foldersのファイルパスをコピーする", async () => {
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<App />);
    await screen.findByTitle("Alpha preview");
    await user.click(screen.getByRole("button", { name: "Folders" }));

    await user.click(
      screen.getByRole("button", {
        name: "Copy file path /tmp/b.html",
      }),
    );

    expect(writeText).toHaveBeenCalledWith("/tmp/b.html");
    expect((await screen.findByRole("status")).textContent).toBe(
      "Path copied!",
    );
  });

  test("Foldersの完全なディレクトリパスをコピーする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          entries: [
            entry("a", "Alpha", "/work/first/index.html"),
            entry("b", "Bravo", "/work/second/report.html"),
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<App />);
    await screen.findByTitle("Alpha preview");
    await user.click(screen.getByRole("button", { name: "Folders" }));

    await user.click(
      screen.getByRole("button", {
        name: "Copy directory path /work/first",
      }),
    );

    expect(writeText).toHaveBeenCalledWith("/work/first");
    expect((await screen.findByRole("status")).textContent).toBe(
      "Path copied!",
    );
  });

  test("同名ファイルと同名ディレクトリを完全なパスで区別してコピーする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          entries: [
            entry("a", "Index", "/work/a/src/index.html"),
            entry("b", "Index", "/work/b/src/index.html"),
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<App />);
    await screen.findByTitle("Index preview");

    await user.click(
      screen.getByRole("button", {
        name: "Copy file path /work/a/src/index.html",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Copy file path /work/b/src/index.html",
      }),
    );
    expect(writeText).toHaveBeenNthCalledWith(1, "/work/a/src/index.html");
    expect(writeText).toHaveBeenNthCalledWith(2, "/work/b/src/index.html");

    await user.click(screen.getByRole("button", { name: "Folders" }));
    expect(
      screen.getByRole("button", {
        name: "Copy file path /work/a/src/index.html",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Copy file path /work/b/src/index.html",
      }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "Copy directory path /work/a/src",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Copy directory path /work/b/src",
      }),
    );
    expect(writeText).toHaveBeenNthCalledWith(3, "/work/a/src");
    expect(writeText).toHaveBeenNthCalledWith(4, "/work/b/src");
  });

  test("ファイルパスのコピー失敗を利用者へ表示する", async () => {
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("permission denied"));
    render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Copy file path" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not copy the path.",
    );
  });

  test("ファイル未選択時はパスをコピーできない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ entries: [] })),
    );
    const user = userEvent.setup();
    writeText = vi.spyOn(window.navigator.clipboard, "writeText");
    render(<App />);

    const copyButton = await screen.findByRole("button", {
      name: "Copy file path",
    });
    expect(copyButton.hasAttribute("disabled")).toBe(true);
    await user.click(copyButton);
    expect(writeText).not.toHaveBeenCalled();
  });

  test("コピー中に選択が変わった場合は古い成功結果を表示しない", async () => {
    let resolveCopy: (() => void) | undefined;
    const pendingCopy = new Promise<void>((resolve) => {
      resolveCopy = resolve;
    });
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockReturnValueOnce(pendingCopy);
    render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Copy file path" }));
    await user.click(screen.getByRole("button", { name: "Open Bravo" }));
    resolveCopy?.();

    await act(async () => pendingCopy);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("コピー中のsession更新後は古い失敗結果を表示しない", async () => {
    let rejectCopy: ((error: Error) => void) | undefined;
    const pendingCopy = new Promise<void>((_resolve, reject) => {
      rejectCopy = reject;
    });
    const user = userEvent.setup();
    writeText = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockReturnValueOnce(pendingCopy);
    render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Copy file path" }));
    act(() => {
      FakeWebSocket.instance?.emitMessage({
        type: "session:update",
        entries: [...initialEntries, entry("c", "Charlie")],
      });
    });
    rejectCopy?.(new Error("permission denied"));

    await act(async () => pendingCopy.catch(() => undefined));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("Clipboard APIが利用できない場合は失敗を表示する", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    render(<App />);
    await screen.findByTitle("Alpha preview");

    await user.click(screen.getByRole("button", { name: "Copy file path" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not copy the path.",
    );
  });

  test("ドラッグアンドドロップした順序をAPIへ送る", async () => {
    render(<App />);
    await screen.findByTitle("Alpha preview");
    const fetchMock = vi.mocked(fetch);
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
    };

    fireEvent.dragStart(screen.getByRole("button", { name: "Reorder Alpha" }), {
      dataTransfer,
    });
    const targetRow = screen
      .getByRole("button", { name: "Open Bravo" })
      .closest(".entry-row");
    expect(targetRow).not.toBeNull();
    fireEvent.dragOver(targetRow as Element, { dataTransfer });
    fireEvent.drop(targetRow as Element, { dataTransfer });

    expect(fetchMock).toHaveBeenCalledWith("/api/session/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["b", "a"] }),
    });
  });

  test("ドラッグ中はポインター位置を維持したリスト行全体を表示する", async () => {
    render(<App />);
    await screen.findByTitle("Alpha preview");
    const dragHandle = screen.getByRole("button", { name: "Reorder Alpha" });
    const row = dragHandle.closest(".entry-row");
    expect(row).not.toBeNull();
    vi.spyOn(row as Element, "getBoundingClientRect").mockReturnValue({
      bottom: 258,
      height: 58,
      left: 100,
      right: 360,
      top: 200,
      width: 260,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });
    const setDragImage = vi.fn();
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      setDragImage,
    };

    const dragStart = createEvent.dragStart(dragHandle, { dataTransfer });
    Object.defineProperties(dragStart, {
      clientX: { value: 108 },
      clientY: { value: 224 },
    });
    fireEvent(dragHandle, dragStart);

    expect(setDragImage).toHaveBeenCalledWith(row, 8, 24);
  });
});

describe("ファイルパネルの表示変換", () => {
  const first = entry("a", "Alpha", "/work/first/index.html");
  const second = entry("b", "Bravo", "/work/second/index.html");
  const third = entry("c", "Charlie", "/work/first/report.html");

  test("並べ替え対象を指定位置へ移動する", () => {
    expect(moveEntry([first, second, third], "a", "c")).toEqual([
      second,
      third,
      first,
    ]);
  });

  test("親ディレクトリごとにリスト順でまとめる", () => {
    expect(groupEntriesByDirectory([first, second, third])).toEqual([
      {
        directory: "/work/first",
        name: "first",
        entries: [first, third],
      },
      {
        directory: "/work/second",
        name: "second",
        entries: [second],
      },
    ]);
  });
});
