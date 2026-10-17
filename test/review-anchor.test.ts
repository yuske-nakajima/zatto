// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import {
  createTextAnchor,
  locateTextAnchor,
} from "../src/web/review-anchor.js";

function documentOf(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function selectText(document: Document, text: string, occurrence = 0): Range {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = (node as Text).data;
    let at = data.indexOf(text);
    while (at !== -1) {
      if (seen === occurrence) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + text.length);
        return range;
      }
      seen += 1;
      at = data.indexOf(text, at + 1);
    }
  }
  throw new Error(`not found: ${text}`);
}

describe("review text anchors", () => {
  test("要素をまたぐ選択を、文章と前後の文脈で記録する", () => {
    const document = documentOf(
      "<p>前置き <strong>強調</strong>した本文</p><script>ignored()</script>",
    );
    const range = document.createRange();
    range.setStart(selectText(document, "置き").startContainer, 1);
    range.setEnd(selectText(document, "した本文").startContainer, 2);

    expect(createTextAnchor(document, range)).toEqual({
      exact: "置き 強調した",
      prefix: "前",
      suffix: "本文",
    });
  });

  test("同じ文章が複数あるときは、前後の文脈が一致する位置を選ぶ", () => {
    const source = documentOf(
      "<p>A: 閲覧URL を返す</p><p>B: 閲覧URL を開く</p>",
    );
    const anchor = createTextAnchor(source, selectText(source, "閲覧URL", 1));
    expect(anchor).toMatchObject({ exact: "閲覧URL" });

    const edited = documentOf(
      "<h1>追加した見出し</h1><p>A: 閲覧URL を返す</p><div><p>B: 閲覧URL を開く</p></div>",
    );
    const range = anchor ? locateTextAnchor(edited, anchor) : null;
    expect(range?.toString()).toBe("閲覧URL");
    expect(range?.startContainer.textContent).toBe("B: 閲覧URL を開く");
  });

  test("SVG 内の style の文字は文脈に含めない", () => {
    const document = documentOf(
      "<p>本文の対象</p><svg><style>#d{fill:red}</style><text>図</text></svg>",
    );

    expect(createTextAnchor(document, selectText(document, "対象"))).toEqual({
      exact: "対象",
      prefix: "本文の",
      suffix: "図",
    });
  });

  test("文章が消えた場合は位置を返さない", () => {
    const document = documentOf("<p>別の内容</p>");

    expect(
      locateTextAnchor(document, { exact: "閲覧URL", prefix: "", suffix: "" }),
    ).toBeNull();
  });

  test("空白だけの選択は記録しない", () => {
    const document = documentOf("<p>本文   本文</p>");

    expect(createTextAnchor(document, selectText(document, "   "))).toBeNull();
  });
});
