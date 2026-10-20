/** Markdown の表示幅。`readable` は最大 980px の中央寄せ、`full` は画面幅いっぱい。 */
export type MarkdownWidth = "readable" | "full";

const STORAGE_KEY = "zatto.markdownWidth";
const MARKDOWN_PATH = /\.(?:md|markdown)$/i;

/** 表示しているファイルが Markdown か。HTML の幅はそのページの CSS で決まるため切り替えない。 */
export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_PATH.test(filePath);
}

/** ブラウザーに保存した表示幅。保存がなければ、読みやすい幅を返す。 */
export function readMarkdownWidth(): MarkdownWidth {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "full"
      ? "full"
      : "readable";
  } catch {
    return "readable";
  }
}

/** 表示幅を全ファイル共通の設定としてブラウザーに保存する。 */
export function writeMarkdownWidth(width: MarkdownWidth): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, width);
  } catch {
    // 保存できない環境では、このページを開いている間だけ切り替える
  }
}

/**
 * プレビューの Markdown のページに表示幅を伝える。ページの CSS が `data-zatto-width` を見て幅を変える。
 * @param frame - プレビューの iframe
 * @param width - 表示幅
 */
export function applyMarkdownWidth(
  frame: HTMLIFrameElement | null,
  width: MarkdownWidth,
): void {
  try {
    const root = frame?.contentDocument?.documentElement;
    if (root) root.dataset.zattoWidth = width;
  } catch {
    // 別のオリジンのページには伝えない
  }
}
