// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";

const appStyles = readFileSync(resolve("src/web/styles.css"), "utf8");
const statusStyles = readFileSync(resolve("src/web/status-bar.css"), "utf8");
const entries: Entry[] = [
  { id: "alpha", title: "Alpha", absPath: "/work/alpha.html", addedAt: 1 },
];

class FakeWebSocket extends EventTarget {
  close(): void {}
}

describe("theme assets and contrast", () => {
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

  test("OSの配色設定に応じてロゴ資産を選択する", async () => {
    render(<App />);
    await screen.findByTitle("Alpha preview");

    const logo = screen.getByRole("img", { name: "zatto" });
    const source = logo.closest("picture")?.querySelector("source");
    expect(logo.getAttribute("src")).toContain("zatto-logo-black.png");
    expect(source?.getAttribute("media")).toBe("(prefers-color-scheme: dark)");
    expect(source?.getAttribute("srcset")).toContain("zatto-logo-white.png");
  });

  test("Status Docsは両テーマの既定・hover・activeで4.5対1以上のコントラストを持つ", async () => {
    render(<App />);
    await screen.findByTitle("Alpha preview");

    const docsButton = screen.getByRole("button", { name: "Docs" });
    expect(docsButton.classList.contains("status-docs-button")).toBe(true);
    expect(statusStyles).toMatch(
      /\.status-docs-button\s*{[^}]*color:\s*var\(--color-text-secondary\)/s,
    );
    expect(statusStyles).toMatch(
      /\.status-docs-button:hover,\s*\.status-docs-button:active\s*{[^}]*color:\s*var\(--color-text-primary\)[^}]*background:\s*var\(--color-bg-hover\)/s,
    );
    expect(statusStyles).not.toMatch(
      /\.status-docs-button:active\s*{[^}]*opacity:/s,
    );

    expect(appStyles).toContain(
      "--color-text-secondary: var(--color-gray-500)",
    );
    expect(appStyles).toContain("--color-bg-app: var(--color-gray-50)");
    expect(
      contrastRatio(
        readHexVariable(appStyles, "--color-gray-500"),
        readHexVariable(appStyles, "--color-gray-50"),
      ),
    ).toBeGreaterThanOrEqual(4.5);

    const darkTheme = appStyles.match(
      /@media \(prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{[^}]*/s,
    )?.[0];
    expect(darkTheme).toContain("--color-text-secondary: #94a3b8");
    expect(darkTheme).toContain("--color-bg-app: #0f1729");
    expect(
      contrastRatio(
        readHexVariable(darkTheme, "--color-text-secondary"),
        readHexVariable(darkTheme, "--color-bg-app"),
      ),
    ).toBeGreaterThanOrEqual(4.5);

    const interactiveThemes = [
      {
        styles: appStyles,
        primary: "--color-gray-900",
        hover: "--color-gray-100",
      },
      {
        styles: darkTheme,
        primary: "--color-text-primary",
        hover: "--color-bg-hover",
      },
    ];
    for (const theme of interactiveThemes) {
      const primary = readHexVariable(theme.styles, theme.primary);
      const hover = readHexVariable(theme.styles, theme.hover);
      expect(contrastRatio(primary, hover)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

function readHexVariable(styles: string | undefined, name: string): string {
  const value = styles?.match(
    new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"),
  )?.[1];
  if (!value) throw new Error(`Missing color variable: ${name}`);
  return value;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function colorChannels(hex: string): number[] {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  if (channels?.length !== 3) throw new Error(`Invalid color: ${hex}`);
  return channels;
}

function luminance(hex: string): number {
  return colorChannels(hex)
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}
