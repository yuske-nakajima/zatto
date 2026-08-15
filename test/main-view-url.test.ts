import { describe, expect, test } from "vitest";
import { activateMainView } from "../src/web/main-view-url.js";

describe("main view URL parameters", () => {
  test.each([
    ["docs", ["searchView", "match", "matchText"]],
    ["search", ["doc", "match", "matchText"]],
    ["preview", ["doc", "searchView", "match", "matchText"]],
  ] as const)(
    "%sを有効化すると排他的な表示パラメーターを除く",
    (view, removed) => {
      const url = new URL(
        "http://localhost/?entry=a&doc=api&lang=ja&searchView=1&search=alpha&match=1.0.5.0&matchText=Alpha&extra=1",
      );

      activateMainView(url, view);

      for (const parameter of removed) {
        expect(url.searchParams.has(parameter)).toBe(false);
      }
      expect(url.searchParams.get("entry")).toBe("a");
      expect(url.searchParams.get("lang")).toBe("ja");
      expect(url.searchParams.get("search")).toBe("alpha");
      expect(url.searchParams.get("extra")).toBe("1");
    },
  );
});
