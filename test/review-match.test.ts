import { describe, expect, test } from "vitest";
import {
  anchorAtPassage,
  compactText,
  locatePassage,
} from "../src/shared/review-match.js";

function found(
  document: string,
  anchor: { exact: string; prefix?: string; suffix?: string },
): string | null {
  const text = compactText(document);
  const match = locatePassage(text, {
    exact: anchor.exact,
    prefix: anchor.prefix ?? "",
    suffix: anchor.suffix ?? "",
  });
  return match && text.slice(match.start, match.end);
}

describe("locatePassage", () => {
  test("文中の修正は、直した後の文章へ付く", () => {
    expect(
      found("保存処理は非同期で実行します。", {
        exact: "保存処理は同期で実行します",
        suffix: "。",
      }),
    ).toBe("保存処理は非同期で実行します");
  });

  test("改行や空白だけの変更では外れない", () => {
    expect(
      found("first line\nsecond line", { exact: "first line second line" }),
    ).toBe("firstlinesecondline");
  });

  test("同じ語句が別の場所にあっても、前後が合わなければ付けない", () => {
    expect(
      found("この処理は削除します。別の話題です。後で必要です。", {
        exact: "必要です",
        prefix: "この処理は",
        suffix: "。",
      }),
    ).toBeNull();
  });

  test("同じ文が複数あると、前後が合う方へ付く", () => {
    const document = "前置き一。対象の文。後ろ一。前置き二。対象の文。後ろ二。";
    const text = compactText(document);
    const match = locatePassage(text, {
      exact: "対象の文",
      prefix: "前置き二。",
      suffix: "。後ろ二",
    });
    expect(match?.start).toBe(text.lastIndexOf("対象の文"));
  });

  test("文脈の記録がなく同じ文が複数あると、どちらにも付けない", () => {
    expect(
      found("前に追加した対象の文章。対象の文章。", { exact: "対象の文章" }),
    ).toBeNull();
  });

  test("文脈の記録がなく一度だけ現れる文には付く", () => {
    expect(found("本文の対象の文章です。", { exact: "対象の文章" })).toBe(
      "対象の文章",
    );
  });

  test("十分に長い文章は、前後が変わっても一意なら付く", () => {
    const exact = "コメントした文章はこの長さがあれば本文の中で特定できます";
    expect(
      found(`新しく足した前置きです。${exact}。新しく足した結びです。`, {
        exact,
        prefix: "以前の前置きでした。",
        suffix: "。以前の結びでした",
      }),
    ).toBe(exact);
  });

  test("段落を丸ごと書き直すと付けない", () => {
    expect(
      found("まったく別の説明に書き換えました。関係のない内容です。", {
        exact: "保存処理は同期で実行します",
        suffix: "。",
      }),
    ).toBeNull();
  });

  test("似た文が並ぶときは、前後で決められなければ付けない", () => {
    expect(
      found("項目Aは有効です。項目Bは有効です。", {
        exact: "項目Cは有効にできます",
      }),
    ).toBeNull();
  });

  test("短い文章はあいまい一致を試さない", () => {
    expect(
      found("前の文。あいん。後の文。", {
        exact: "あいう",
        prefix: "前の文。",
        suffix: "。後の文。",
      }),
    ).toBeNull();
  });

  test("空の文章は見つからない", () => {
    expect(found("本文", { exact: "   " })).toBeNull();
  });
});

describe("anchorAtPassage", () => {
  test("一度だけ現れる文章に前後の文脈を付ける", () => {
    expect(
      anchorAtPassage(compactText("前の文。対象 の文。後の文。"), "対象 の文"),
    ).toEqual({ exact: "対象 の文", prefix: "前の文。", suffix: "。後の文。" });
  });

  test("見つからない文章と複数ある文章には付けない", () => {
    expect(anchorAtPassage("本文", "別の文")).toBeNull();
    expect(anchorAtPassage("説明と説明", "説明")).toBeNull();
  });

  test("付けた文章は探し直せる", () => {
    const text = compactText("前の文。対象の文。後の文。対象。");
    const anchor = anchorAtPassage(text, "対象の文");
    expect(anchor && locatePassage(text, anchor)).toEqual({
      start: text.indexOf("対象の文"),
      end: text.indexOf("対象の文") + 4,
    });
  });
});
