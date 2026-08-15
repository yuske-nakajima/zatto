// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";

const docsStyles = readFileSync(resolve("src/web/docs.css"), "utf8");
const statusStyles = readFileSync(resolve("src/web/status-bar.css"), "utf8");
const appStyles = readFileSync(resolve("src/web/styles.css"), "utf8");

const entries: Entry[] = [
  { id: "alpha", title: "Alpha", absPath: "/work/alpha.html", addedAt: 1 },
];

class FakeWebSocket extends EventTarget {
  close(): void {}
}

describe("built-in documentation design", () => {
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

  test("言語、Close、Docsの表示を保ちながらアクセシブル名を固定する", async () => {
    render(<App />);
    await screen.findByTitle("Alpha preview");

    const docsButton = screen.getByRole("button", { name: "Docs" });
    expect(docsButton.querySelector(".status-docs-glyph")?.textContent).toBe(
      "?",
    );
    expect(docsButton.querySelector(".status-docs-label")?.textContent).toBe(
      "Docs",
    );
    fireEvent.click(docsButton);

    const language = screen.getByRole("group", {
      name: "Documentation language",
    });
    expect(
      within(language).getByRole("button", { name: "English" }),
    ).toBeTruthy();
    expect(
      within(language).getByRole("button", { name: "Japanese" }),
    ).toBeTruthy();
    expect(language.querySelector(".docs-language-divider")).toBeTruthy();
    expect(
      language.querySelectorAll(".docs-language-label--compact"),
    ).toHaveLength(2);

    const close = screen.getByRole("button", {
      name: "Close documentation",
    });
    expect(close.querySelector(".docs-close-icon")?.textContent).toBe("✕");
    expect(close.querySelector(".docs-close-label")?.textContent).toBe("Close");
  });

  test("Docsヘッダー、ナビゲーション、キャンバスの寸法と状態を定義する", () => {
    expect(docsStyles).toMatch(
      /\.docs-view\s*{[^}]*font-family:\s*Inter, Arial, sans-serif/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-header\s*{[^}]*padding:\s*14px 24px 10px[^}]*border-bottom:\s*1px solid var\(--color-border-subtle\)/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-eyebrow\s*{[^}]*font-size:\s*9px[^}]*font-weight:\s*600[^}]*letter-spacing:\s*0\.8px/s,
    );
    expect(docsStyles).toMatch(/\.docs-header h1\s*{[^}]*font-size:\s*16px/s);
    expect(docsStyles).toMatch(
      /\.docs-pages\s*{[^}]*gap:\s*4px[^}]*padding:\s*6px 24px/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-pages button\s*{[^}]*padding:\s*5px 10px[^}]*font-size:\s*12px/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-pages button\s*{[^}]*background:\s*transparent/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-language button\s*{[^}]*color:\s*var\(--color-text-primary\)/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-close-icon\s*{[^}]*color:\s*var\(--color-text-secondary\)/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-close-label\s*{[^}]*color:\s*var\(--color-text-primary\)/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-canvas\s*{[^}]*padding:\s*16px 24px 24px/s,
    );
    expect(docsStyles).toMatch(
      /\.docs-canvas iframe\s*{[^}]*border-radius:\s*12px/s,
    );
    expect(docsStyles).toMatch(
      /@media \(max-width:\s*520px\)[\s\S]*\.docs-close-label\s*{[^}]*display:\s*none/s,
    );
    expect(docsStyles).toMatch(
      /@media \(max-width:\s*520px\)[\s\S]*\.docs-close-icon\s*{[^}]*font-size:\s*12px/s,
    );
  });

  test("Status Docsの状態とOS設定に追従するダークテーマを定義する", () => {
    expect(statusStyles).toMatch(
      /\.status-docs-button\s*{[^}]*padding:\s*1px 5px/s,
    );
    expect(statusStyles).toMatch(/\.status-docs-button\s*{[^}]*gap:\s*3px/s);
    expect(statusStyles).toMatch(
      /\.status-docs-button\s*{[^}]*border-radius:\s*4px/s,
    );
    expect(statusStyles).toMatch(
      /\.status-docs-button\s*{[^}]*border:\s*0[^}]*height:\s*17px/s,
    );
    expect(statusStyles).toMatch(
      /\.status-docs-glyph\s*{[^}]*font-size:\s*9px/s,
    );
    expect(statusStyles).toMatch(
      /\.status-docs-label\s*{[^}]*font-size:\s*10px[^}]*line-height:\s*15px/s,
    );
    expect(statusStyles).toMatch(
      /\.status-docs-button\[aria-pressed="true"\]\s*{[^}]*height:\s*19px[^}]*border:\s*1px solid var\(--color-border-accent\)[^}]*background:\s*var\(--color-bg-selected\)/s,
    );
    const darkTheme = appStyles.match(
      /@media \(prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{[^}]*/s,
    )?.[0];
    expect(darkTheme).toContain("--color-bg-app: #0f1729");
    expect(darkTheme).toContain("--color-bg-surface: #1a1f2e");
    expect(darkTheme).toContain("--color-border-accent: #6366f2");
    expect(darkTheme).toContain("--color-text-primary: #f0f5fa");
    expect(darkTheme).toContain("--color-text-accent: #828cf7");
  });
});
