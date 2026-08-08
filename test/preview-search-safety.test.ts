// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearPreviewSearchTarget,
  revealPreviewSearchTarget,
} from "../src/web/preview-search-target.js";
import { createSearchResultLocator } from "../src/web/search-result-locator.js";

afterEach(() => {
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe("search result locator safety", () => {
  test.each([
    "alpha",
    '<p data-label="alpha">attribute</p>',
    "<script>alpha</script>",
    "<p hidden>alpha</p>",
    '<p aria-hidden="true">alpha</p>',
    '<p style="display: none">alpha</p>',
  ])("表示テキストでない一致はpreview位置にしない: %s", (source) => {
    expect(createSearchResultLocator("a", line(source), 0, "alpha")).toBeNull();
  });

  test("文脈なしでは複数の表示一致からordinalで推測しない", () => {
    document.body.innerHTML = "<p>alpha</p><p>alpha</p>";
    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        ordinalHint: 1,
      }),
    ).toBe(false);
    expect(document.getSelection()?.toString()).toBe("");
  });
});

describe("preview search traversal limits", () => {
  test("match上限までは文脈で特定し、超過時は選択しない", () => {
    document.body.textContent = `${"alpha ".repeat(999)}alpha unique`;
    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        suffixHint: " unique",
      }),
    ).toBe(true);

    document.body.textContent = `${"alpha ".repeat(1000)}alpha unique`;
    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        suffixHint: " unique",
      }),
    ).toBe(false);
  });

  test("text node上限を超えたDOMでは選択しない", () => {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 4_999; index += 1) {
      fragment.append(
        document.createTextNode("x"),
        document.createElement("i"),
      );
    }
    fragment.append(document.createTextNode("alpha"));
    document.body.append(fragment);

    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        prefixHint: "",
        suffixHint: "",
      }),
    ).toBe(true);
    document.body.append(document.createTextNode("x"));
    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        prefixHint: "",
        suffixHint: "",
      }),
    ).toBe(false);
  });

  test("走査文字数上限を超えたDOMでは選択しない", () => {
    const options = {
      source: document,
      query: "alpha",
      prefixHint: "",
      suffixHint: "",
    } as const;
    document.body.textContent = `${"x".repeat(999_995)}alpha`;
    expect(revealPreviewSearchTarget(options)).toBe(true);
    document.body.textContent = `${"x".repeat(999_996)}alpha`;
    expect(revealPreviewSearchTarget(options)).toBe(false);
  });
});

test("検索選択がユーザーに変更されていれば解除しない", () => {
  document.body.innerHTML = "<p id='search'>alpha</p><p id='user'>keep</p>";
  const options = {
    source: document,
    query: "alpha",
    prefixHint: "",
    suffixHint: "",
  } as const;
  expect(revealPreviewSearchTarget(options)).toBe(true);
  const userText = document.querySelector("#user")?.firstChild;
  const selection = document.getSelection();
  if (userText && selection) {
    const range = document.createRange();
    range.selectNodeContents(userText);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  expect(clearPreviewSearchTarget(options)).toBe(false);
  expect(selection?.toString()).toBe("keep");
});

test("一致しない場合と空queryでは選択を変更しない", () => {
  document.body.innerHTML = "<p id='existing'>keep</p>";
  const text = document.querySelector("#existing")?.firstChild;
  const selection = document.getSelection();
  const range = document.createRange();
  if (text && selection) {
    range.selectNodeContents(text);
    selection.addRange(range);
  }

  expect(
    revealPreviewSearchTarget({ source: document, query: "missing" }),
  ).toBe(false);
  expect(selection?.toString()).toBe("keep");
  expect(
    revealPreviewSearchTarget({
      source: document,
      query: "   ",
      matchText: "keep",
    }),
  ).toBe(false);
  expect(selection?.toString()).toBe("keep");
});

test("iframeのdocumentへアクセスできない場合は例外を返さない", () => {
  const frame = Object.create(HTMLIFrameElement.prototype) as HTMLIFrameElement;
  Object.defineProperty(frame, "contentDocument", {
    get() {
      throw new DOMException("Blocked", "SecurityError");
    },
  });

  expect(() =>
    revealPreviewSearchTarget({ source: frame, query: "alpha" }),
  ).not.toThrow();
  expect(revealPreviewSearchTarget({ source: frame, query: "alpha" })).toBe(
    false,
  );
});

function line(source: string) {
  return {
    lineNumber: 1,
    startOffset: 0,
    lineText: source,
    truncated: false,
    ranges: [{ start: source.indexOf("alpha"), length: 5 }],
  };
}
