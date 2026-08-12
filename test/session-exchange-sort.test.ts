import { describe, expect, test } from "vitest";
import { sortSessionExchangeEntriesByPath } from "../src/shared/session-exchange.js";

describe("session exchange path order", () => {
  test("separatorを正規化してdirectoryとfilenameをcode point順に並べる", () => {
    const entries = [
      { path: "C:\\work\\z.html" },
      { path: "/work/a/B.html" },
      { path: "/work/a/a.html" },
      { path: "/other/x.html" },
    ];

    expect(sortSessionExchangeEntriesByPath(entries)).toEqual([
      { path: "/other/x.html" },
      { path: "/work/a/B.html" },
      { path: "/work/a/a.html" },
      { path: "C:\\work\\z.html" },
    ]);
    expect(entries[0]).toEqual({ path: "C:\\work\\z.html" });
  });

  test("同じ比較keyは入力順を維持する", () => {
    const first = { path: "/work/a.html" };
    const second = { path: "/work/a.html" };

    expect(sortSessionExchangeEntriesByPath([first, second])).toEqual([
      first,
      second,
    ]);
  });
});
