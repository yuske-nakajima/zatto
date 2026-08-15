import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const DOCS_ROOT = path.resolve("src/web/public/docs");
const LOCALES = ["en", "ja"] as const;
const SLUGS = ["getting-started", "cli", "api", "gui-api-mapping"] as const;
const HTTP_OPERATIONS = [
  "GET /",
  "GET /manifest.webmanifest",
  "GET /assets/*",
  "GET /docs/*",
  "GET /api/health",
  "GET /api/session",
  "GET /api/session/export",
  "PUT /api/session",
  "GET /api/search",
  "GET /api/agent/context",
  "PUT /api/agent/context",
  "POST /api/session/pick",
  "POST /api/session/pick-directory",
  "POST /api/session/add",
  "PATCH /api/session/order",
  "DELETE /api/session/entries",
  "DELETE /api/session/:id",
  "DELETE /api/session",
  "POST /api/shutdown",
  "GET /f/:id/",
  "GET /f/:id/*",
] as const;
const GUI_OPERATIONS = [
  "GET /api/session",
  "GET /f/:id/",
  "GET /docs/*",
  "WS /ws",
  "GET /api/search",
  "POST /api/session/pick",
  "POST /api/session/pick-directory",
  "PATCH /api/session/order",
  "DELETE /api/session/:id",
  "DELETE /api/session/entries",
  "DELETE /api/session",
  "PUT /api/session",
  "GET /api/session/export",
  "PUT /api/agent/context",
] as const;

describe("組み込みドキュメント本文", () => {
  test("英語と日本語に同じ4ページがそろう", async () => {
    for (const locale of LOCALES) {
      const fileNames = (await readdir(path.join(DOCS_ROOT, locale)))
        .filter((fileName) => fileName.endsWith(".html"))
        .sort();
      expect(fileNames).toEqual(SLUGS.map((slug) => `${slug}.html`).sort());
    }
  });

  test("各ページが外部依存のない読みやすいHTML文書である", async () => {
    for (const locale of LOCALES) {
      for (const slug of SLUGS) {
        const html = await readDoc(locale, slug);
        expect(html).toMatch(/^<!doctype html>/i);
        expect(html).toContain(`<html lang="${locale}">`);
        expect(html).toMatch(/<title>[^<]+ \| zatto<\/title>/);
        expect(html).toContain('name="viewport"');
        expect(html).toContain("<main");
        expect(html).toContain("<style>");
        expect(html).not.toMatch(/<script\b/i);
        expect(html).not.toMatch(/<(?:link|img|iframe)\b/i);
        expect(html).not.toMatch(/(?:https?:)?\/\//i);
        expect(html).not.toMatch(/(?:\/Users\/|[A-Z]:\\|Figma)/i);
      }
    }
  });

  test("APIページが全21 HTTP routesとWebSocketを記載する", async () => {
    expect(HTTP_OPERATIONS).toHaveLength(21);
    for (const locale of LOCALES) {
      const html = await readDoc(locale, "api");
      const codeValues = readCodeValues(html);
      for (const operation of HTTP_OPERATIONS) {
        expect(codeValues).toContain(operation);
      }
      expect(codeValues).toContain("WS /ws");
    }
  });

  test("APIページが追加対象と検索の照合規則を正確に説明する", async () => {
    const englishHtml = await readDoc("en", "api");
    const japaneseHtml = await readDoc("ja", "api");

    expect(englishHtml).toContain(
      "The endpoint does not require an HTML file extension.",
    );
    expect(englishHtml).toContain("case-insensitive fixed string");
    expect(japaneseHtml).toContain("HTMLの拡張子は必須ではありません");
    expect(japaneseHtml).toContain("大文字・小文字を区別しない固定文字列");
  });

  test("GUI/API対照表がブラウザーUIの通信を網羅する", async () => {
    for (const locale of LOCALES) {
      const html = await readDoc(locale, "gui-api-mapping");
      const codeValues = readCodeValues(html);
      for (const operation of GUI_OPERATIONS) {
        expect(codeValues).toContain(operation);
      }
    }
  });
});

async function readDoc(
  locale: (typeof LOCALES)[number],
  slug: (typeof SLUGS)[number],
): Promise<string> {
  return readFile(path.join(DOCS_ROOT, locale, `${slug}.html`), "utf8");
}

function readCodeValues(html: string): string[] {
  return Array.from(
    html.matchAll(/<code(?:\s[^>]*)?>([^<]+)<\/code>/g),
    (match) => match[1] ?? "",
  );
}
