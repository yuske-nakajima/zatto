import type { PreviewTextMatch } from "./preview-search-matches.js";

const MATCHES_NAME = "zatto-page-search-matches";
const CURRENT_NAME = "zatto-page-search-current";
const STYLE_ATTRIBUTE = "data-zatto-page-search-styles";

type HighlightValue = object;

interface HighlightConstructor {
  new (...ranges: Range[]): HighlightValue;
}

interface HighlightRegistry {
  delete(name: string): boolean | undefined;
  set(name: string, highlight: HighlightValue): void;
}

interface HighlightWindow {
  CSS?: { highlights?: HighlightRegistry };
  Highlight?: HighlightConstructor;
}

/** ユーザー選択を変更せず、ページ検索専用のhighlightだけを管理する。 */
export interface PreviewPageHighlights {
  length: number;
  clear: () => void;
  show: (index: number) => boolean;
}

/**
 * CSS Custom Highlight APIを使ってプレビュー内の一致箇所を表示する。
 *
 * @param document - 検索対象の文書
 * @param matches - 表示する一致箇所
 * @returns highlight操作。未対応またはアクセス不能ならnull
 */
export function createPreviewPageHighlights(
  document: Document,
  matches: PreviewTextMatch[],
): PreviewPageHighlights | null {
  let registry: HighlightRegistry | undefined;
  let style: HTMLStyleElement | null = null;
  try {
    const view = document.defaultView as unknown as HighlightWindow | null;
    const Highlight = view?.Highlight;
    registry = view?.CSS?.highlights;
    if (!Highlight || !registry) return null;
    const ranges = matches.map((match) => createRange(document, match));
    style = installStyles(document);
    const activeRegistry = registry;
    const activeStyle = style;
    activeRegistry.set(MATCHES_NAME, new Highlight(...ranges));

    return {
      length: ranges.length,
      show(index) {
        const range = ranges[index];
        const match = matches[index];
        if (!range || !match) return false;
        try {
          activeRegistry.set(CURRENT_NAME, new Highlight(range));
        } catch {
          return false;
        }
        try {
          match.container.scrollIntoView({ block: "center" });
        } catch {
          // Scrolling support does not affect the highlight registry.
        }
        return true;
      },
      clear() {
        deleteHighlight(activeRegistry, MATCHES_NAME);
        deleteHighlight(activeRegistry, CURRENT_NAME);
        activeStyle.remove();
      },
    };
  } catch {
    if (registry) {
      deleteHighlight(registry, MATCHES_NAME);
      deleteHighlight(registry, CURRENT_NAME);
    }
    style?.remove();
    return null;
  }
}

function deleteHighlight(registry: HighlightRegistry, name: string): void {
  try {
    registry.delete(name);
  } catch {
    // A detached document can reject registry access during cleanup.
  }
}

function createRange(document: Document, match: PreviewTextMatch): Range {
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.start + match.length);
  return range;
}

function installStyles(document: Document): HTMLStyleElement {
  document.querySelector(`[${STYLE_ATTRIBUTE}]`)?.remove();
  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = `
    ::highlight(${MATCHES_NAME}) {
      background-color: #fef08a;
    }
    ::highlight(${CURRENT_NAME}) {
      background-color: #fb923c;
      text-decoration: underline 2px #c2410c;
    }
  `;
  (document.head ?? document.documentElement).append(style);
  return style;
}
