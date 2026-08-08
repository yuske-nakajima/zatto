import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";
import type { SearchLineMatch, SearchResponse } from "../src/shared/search.js";

describe("HTML search Unicode matching", () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-unicode-test-"));
    const htmlPath = path.join(tempDir, "unicode.html");
    await writeFile(
      htmlPath,
      "<title>Unicode</title>\n<p>Σσς ſS İX 😀😀 .*</p>",
      "utf8",
    );
    const store = new SessionStore(path.join(tempDir, "session.json"));
    await store.load();
    await store.addEntries([htmlPath]);
    app = await createApp({ sessionStore: store });
  });

  afterEach(async () => {
    await app.close();
    await rm(tempDir, { force: true, recursive: true });
  });

  test.each([
    ["σ", ["Σ", "σ", "ς"]],
    ["s", ["ſ", "S"]],
    ["x", ["X"]],
    ["😀", ["😀", "😀"]],
    [".*", [".*"]],
  ])(
    "%sを正規表現として解釈せずUnicode case foldingで検索する",
    async (query, expected) => {
      const response = await app.inject({
        method: "GET",
        url: `/api/search?q=${encodeURIComponent(query)}`,
      });
      const result = response.json<SearchResponse>();
      const lines = result.files.flatMap((file) => file.lines);

      expect(response.statusCode).toBe(200);
      expect(extractMatches(lines)).toEqual(expected);
      for (const line of lines) {
        for (const range of line.ranges) {
          expect(range.length).toBe(
            line.lineText.slice(range.start, range.start + range.length).length,
          );
        }
      }
    },
  );
});

function extractMatches(lines: SearchLineMatch[]): string[] {
  return lines.flatMap((line) =>
    line.ranges.map((range) =>
      line.lineText.slice(range.start, range.start + range.length),
    ),
  );
}
