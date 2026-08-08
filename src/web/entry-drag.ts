import type { DragEvent } from "react";

/** ドラッグ画像の座標を、ポインターと行の左上との差分で保持する。 */
export function prepareEntryDrag(
  event: DragEvent<HTMLButtonElement>,
  entryId: string,
): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", entryId);
  const row = event.currentTarget.closest<HTMLElement>(".entry-row");
  if (row && typeof event.dataTransfer.setDragImage === "function") {
    const bounds = row.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      row,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
  }
}
