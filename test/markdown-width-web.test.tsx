// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";
import { rpcFixture } from "./rpc-client-fixture.js";

const entries: Entry[] = [
  { id: "note", title: "Note", absPath: "/work/note.md", addedAt: 1 },
  { id: "page", title: "Page", absPath: "/work/page.html", addedAt: 2 },
];

class FakeWebSocket extends EventTarget {
  close(): void {}
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/?entry=note");
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      rpcFixture(async (method) => {
        if (method === "session.get") return Response.json({ entries });
        return new Response(null, { status: 204 });
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function frameRoot(title: string): HTMLElement | undefined {
  const frame = screen.getByTitle<HTMLIFrameElement>(title);
  // jsdom は src のページを読み込まないため、読み込んだ状態の文書を作ってから load を送る
  frame.contentDocument?.write('<article class="markdown-body"></article>');
  frame.contentDocument?.close();
  fireEvent.load(frame);
  return frame.contentDocument?.documentElement;
}

test("Markdown の表示幅を切り替え、全ファイル共通の設定としてブラウザーに保存する", async () => {
  render(<App />);
  await screen.findByTitle("Note preview");
  expect(frameRoot("Note preview")?.dataset.zattoWidth).toBe("readable");

  const button = screen.getByRole("button", { name: "Full-width Markdown" });
  expect(button.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(button);
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(window.localStorage.getItem("zatto.markdownWidth")).toBe("full");
  expect(
    screen.getByTitle<HTMLIFrameElement>("Note preview").contentDocument
      ?.documentElement.dataset.zattoWidth,
  ).toBe("full");
});

test("保存した表示幅で開き、HTML のファイルではボタンを出さない", async () => {
  window.localStorage.setItem("zatto.markdownWidth", "full");
  render(<App />);
  await screen.findByTitle("Note preview");
  expect(frameRoot("Note preview")?.dataset.zattoWidth).toBe("full");
  expect(
    screen
      .getByRole("button", { name: "Full-width Markdown" })
      .getAttribute("aria-pressed"),
  ).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Open Page" }));
  await screen.findByTitle("Page preview");
  expect(
    screen.queryByRole("button", { name: "Full-width Markdown" }),
  ).toBeNull();
});
