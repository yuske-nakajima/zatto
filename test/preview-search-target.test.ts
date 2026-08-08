// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import { revealPreviewSearchTarget } from "../src/web/preview-search-target.js";

function setBody(html: string): void {
  document.body.innerHTML = html;
  document.getSelection()?.removeAllRanges();
}

afterEach(() => {
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe("revealPreviewSearchTarget", () => {
  test("表示文脈に対応するテキストを選択して中央へ移動する", () => {
    setBody(
      "<p id='first'>first Alpha tail</p><p id='second'>second alpha tail</p>",
    );
    const second = document.querySelector<HTMLElement>("#second");
    const scrollIntoView = vi.fn();
    second?.addEventListener("scroll-request", scrollIntoView);
    if (second) {
      second.scrollIntoView = (options) => {
        expect(options).toEqual({ block: "center" });
        second.dispatchEvent(new Event("scroll-request"));
      };
    }

    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        ordinalHint: 1,
        prefixHint: "second ",
        suffixHint: " tail",
      }),
    ).toBe(true);
    expect(document.getSelection()?.toString()).toBe("alpha");
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  test("Unicode文字を大文字と小文字を区別せず選択する", () => {
    setBody("<p id='target'>Caf\u00e9</p>");
    const target = document.querySelector<HTMLElement>("#target");
    if (target) target.scrollIntoView = vi.fn();

    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "CAF\u00c9",
        prefixHint: "",
        suffixHint: "",
      }),
    ).toBe(true);
    expect(document.getSelection()?.toString()).toBe("Caf\u00e9");
  });

  test("same-origin iframe内の一致を選択する", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("iframe document is unavailable");
    frameDocument.body.innerHTML = "<p id='target'>alpha</p>";
    const target = frameDocument.querySelector<HTMLElement>("#target");
    const scrollIntoView = vi.fn();
    if (target) target.scrollIntoView = scrollIntoView;

    expect(
      revealPreviewSearchTarget({
        source: frame,
        query: "alpha",
        prefixHint: "",
        suffixHint: "",
      }),
    ).toBe(true);
    expect(frameDocument.getSelection()?.toString()).toBe("alpha");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  test("matchTextがあればqueryより具体的な文字列を選択する", () => {
    setBody("<p id='target'>alpha target phrase</p>");
    const target = document.querySelector<HTMLElement>("#target");
    if (target) target.scrollIntoView = vi.fn();

    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        matchText: "target phrase",
        prefixHint: "alpha ",
        suffixHint: "",
      }),
    ).toBe(true);
    expect(document.getSelection()?.toString()).toBe("target phrase");
  });

  test("非表示領域と表示対象外の要素を走査しない", () => {
    setBody(`
      <script>alpha</script>
      <style>.alpha { color: red }</style>
      <template>alpha</template>
      <noscript>alpha</noscript>
      <p hidden>alpha</p>
      <p aria-hidden="true">alpha</p>
      <p style="display: none">alpha</p>
      <p style="visibility: hidden">alpha</p>
      <p id="visible">visible alpha tail</p>
    `);
    const visible = document.querySelector<HTMLElement>("#visible");
    const scrollIntoView = vi.fn();
    if (visible) visible.scrollIntoView = scrollIntoView;

    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        ordinalHint: 0,
        prefixHint: "visible ",
        suffixHint: " tail",
      }),
    ).toBe(true);
    expect(document.getSelection()?.anchorNode?.parentElement?.id).toBe(
      "visible",
    );
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  test("context hintでraw ordinalのずれを補正し、曖昧なら移動しない", () => {
    setBody(`
      <script>alpha</script>
      <p id="first">first alpha tail</p>
      <p id="second">second alpha tail</p>
    `);
    const first = document.querySelector<HTMLElement>("#first");
    const second = document.querySelector<HTMLElement>("#second");
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    if (first) first.scrollIntoView = firstScroll;
    if (second) second.scrollIntoView = secondScroll;

    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        ordinalHint: 1,
        prefixHint: "first ",
        suffixHint: " tail",
      }),
    ).toBe(true);
    expect(document.getSelection()?.anchorNode?.parentElement?.id).toBe(
      "first",
    );
    expect(firstScroll).toHaveBeenCalledOnce();

    expect(
      revealPreviewSearchTarget({
        source: document,
        query: "alpha",
        ordinalHint: 1,
        suffixHint: " tail",
      }),
    ).toBe(false);
    expect(document.getSelection()?.anchorNode?.parentElement?.id).toBe(
      "first",
    );
    expect(secondScroll).not.toHaveBeenCalled();
  });
});
