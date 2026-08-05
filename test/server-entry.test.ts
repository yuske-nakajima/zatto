import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { isDirectExecution } from "../src/server/direct-execution.js";

describe("server entry", () => {
  test("空白とURL予約文字を含む実行パスをESM URLと比較できる", () => {
    const entryPath = "/tmp/zatto package #%?/dist/server/index.js";

    expect(isDirectExecution(pathToFileURL(entryPath).href, entryPath)).toBe(
      true,
    );
  });

  test("異なる実行パスは直接実行として扱わない", () => {
    expect(
      isDirectExecution(
        "file:///tmp/zatto/dist/server/index.js",
        "/tmp/consumer/dist/server/index.js",
      ),
    ).toBe(false);
  });
});
