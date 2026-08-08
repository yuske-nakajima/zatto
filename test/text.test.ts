import { describe, expect, test } from "vitest";
import { truncateUnicode } from "../src/shared/text.js";

describe("truncateUnicode", () => {
  test("先頭側の上限でsurrogate pairを分断しない", () => {
    expect(truncateUnicode(`${"a".repeat(255)}😀`, 256)).toBe("a".repeat(255));
  });

  test("末尾側の上限でsurrogate pairを分断しない", () => {
    expect(truncateUnicode(`😀${"a".repeat(39)}`, 40, "end")).toBe(
      "a".repeat(39),
    );
  });

  test("入力に含まれる孤立surrogateを置換する", () => {
    expect(truncateUnicode("before\ud800after", 20)).toBe("before�after");
  });
});
