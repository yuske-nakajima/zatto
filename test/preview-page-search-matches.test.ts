// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";
import { collectVisiblePreviewMatches } from "../src/web/preview-search-matches.js";

afterEach(() => document.body.replaceChildren());

describe("collectVisiblePreviewMatches", () => {
  test("表示テキストだけを大文字小文字を区別せず固定文字列検索する", () => {
    document.body.innerHTML = `
      <p>Alpha [one]</p>
      <script>alpha [one]</script>
      <style>.alpha { display: none }</style>
      <template>alpha [one]</template>
      <noscript>alpha [one]</noscript>
      <p hidden>alpha [one]</p>
      <p aria-hidden="true">alpha [one]</p>
      <p style="display:none">alpha [one]</p>
      <p style="visibility:hidden">alpha [one]</p>
      <p>alpha [one]</p>
    `;

    const matches = collectVisiblePreviewMatches(document, "ALPHA [ONE]");
    expect(matches).toHaveLength(2);
  });

  test("一致数上限を超える場合は結果を返さない", () => {
    document.body.textContent = "alpha ".repeat(1_001);
    expect(collectVisiblePreviewMatches(document, "alpha")).toBeNull();
  });
});
