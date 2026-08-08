/**
 * iframe文書内で現在focusされている要素を取得する。
 *
 * @param document - 検索開始元のiframe文書
 * @returns 復帰可能なfocus要素。文書本体の場合はnull
 */
export function capturePreviewFocus(document: Document): HTMLElement | null {
  const activeElement = document.activeElement;
  const HTMLElement = document.defaultView?.HTMLElement;
  return HTMLElement &&
    activeElement instanceof HTMLElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
    ? activeElement
    : null;
}

/**
 * 保存したiframe内要素へfocusし、復帰不能ならiframe自体へfocusする。
 *
 * @param element - 検索開始前にfocusされていた要素
 * @param iframe - 検索対象のiframe
 */
export function restorePreviewFocus(
  element: HTMLElement | null,
  iframe: HTMLIFrameElement | null,
): void {
  if (canRestoreElement(element, iframe)) {
    try {
      element.focus();
      return;
    } catch {
      // Detached browsing contexts can reject focus during replacement.
    }
  }
  try {
    iframe?.focus();
  } catch {
    // Focus restoration is best-effort after the search UI closes.
  }
}

function canRestoreElement(
  element: HTMLElement | null,
  iframe: HTMLIFrameElement | null,
): element is HTMLElement {
  try {
    return Boolean(
      element?.isConnected && iframe?.contentDocument === element.ownerDocument,
    );
  } catch {
    return false;
  }
}
