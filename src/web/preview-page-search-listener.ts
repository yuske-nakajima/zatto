const CAPTURE_OPTIONS = { capture: true } as const;

/**
 * iframe文書の検索ショートカットをcapture phaseで購読する。
 *
 * @param document - 購読対象のiframe文書
 * @param onFind - 検索ショートカットを受けた際の処理
 * @returns 同一optionsでlistenerを解除する処理
 */
export function listenForPreviewPageSearch(
  document: Document,
  onFind: () => void,
): () => void {
  const listener = (event: KeyboardEvent) => {
    if (
      event.key.toLowerCase() !== "f" ||
      (!event.metaKey && !event.ctrlKey) ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onFind();
  };
  document.addEventListener("keydown", listener, CAPTURE_OPTIONS);
  return () =>
    document.removeEventListener("keydown", listener, CAPTURE_OPTIONS);
}
