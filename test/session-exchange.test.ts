import { describe, expect, test } from "vitest";
import {
  createSessionExchange,
  parseSessionExchange,
  SessionExchangeValidationError,
} from "../src/shared/session-exchange.js";

describe("session exchange format", () => {
  test("表示順と絶対パスだけを交換形式へ変換する", () => {
    expect(
      createSessionExchange([
        {
          id: "first-id",
          absPath: "/work/first.html",
          title: "First",
          addedAt: 1,
        },
        {
          id: "second-id",
          absPath: "/work/second.htm",
          title: "Second",
          addedAt: 2,
        },
      ]),
    ).toEqual({
      format: "zatto-session",
      version: 1,
      entries: [{ path: "/work/first.html" }, { path: "/work/second.htm" }],
    });
  });

  test.each([
    ["null", null],
    ["配列", []],
    ["format不一致", { format: "other", version: 1, entries: [] }],
    ["entries欠落", { format: "zatto-session", version: 1 }],
    [
      "path以外のフィールド",
      {
        format: "zatto-session",
        version: 1,
        entries: [{ path: "/work/a.html", id: "forbidden" }],
      },
    ],
  ])("%sを不正な交換形式として拒否する", (_label, input) => {
    expect(() => parseSessionExchange(input)).toThrow(
      SessionExchangeValidationError,
    );
  });

  test("未対応versionを区別して拒否する", () => {
    expect(() =>
      parseSessionExchange({
        format: "zatto-session",
        version: 2,
        entries: [],
      }),
    ).toThrow("セッション形式の version 2 には対応していません");
  });

  test("重複パスを拒否する", () => {
    expect(() =>
      parseSessionExchange({
        format: "zatto-session",
        version: 1,
        entries: [{ path: "/work/a.html" }, { path: "/work/a.html" }],
      }),
    ).toThrow("entries に重複した path を指定できません");
  });
});
