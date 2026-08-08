import { type DragEvent, useId, useState } from "react";
import type { Entry } from "../server/session.js";
import { fileName } from "./file-panel-model.js";
import { Icon } from "./icons.js";

interface EntryRowProps {
  entry: Entry;
  isSelected: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  grouped?: boolean;
  onSelect: (id: string) => void;
  onCopyPath: (path: string) => void;
  onRemove: (id: string) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>, id: string) => void;
  onDragEnter?: (id: string) => void;
  onDragEnd?: () => void;
  onDrop?: (id: string) => void;
}

interface TooltipState {
  text: string;
  left: number;
  top: number;
}

export function EntryRow({
  entry,
  isSelected,
  isDragging = false,
  isDropTarget = false,
  grouped = false,
  onSelect,
  onCopyPath,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: EntryRowProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipId = useId();
  const pathDescriptionId = `entry-path-${entry.id}`;
  const draggable = Boolean(onDragStart);
  const rowClassName = [
    "entry-row",
    isSelected && "entry-row--selected",
    isDragging && "entry-row--dragging",
    isDropTarget && !isDragging && "entry-row--drop-target",
    grouped && "entry-row--grouped",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={rowClassName}
      onDragOver={
        onDrop
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onDragEnter?.(entry.id);
            }
          : undefined
      }
      onDrop={
        onDrop
          ? (event) => {
              event.preventDefault();
              void onDrop(entry.id);
            }
          : undefined
      }
    >
      {draggable && (
        <button
          className="entry-drag"
          data-status-description="Drag to reorder this file."
          type="button"
          draggable
          aria-label={`Reorder ${entry.title}`}
          onDragStart={(event) => onDragStart?.(event, entry.id)}
          onDragEnd={onDragEnd}
        >
          <Icon name={isSelected ? "gripAccent" : "gripDefault"} size={10} />
        </button>
      )}
      <button
        className="entry-select"
        data-status-description="Open this file in the preview."
        type="button"
        aria-label={`Open ${entry.title}`}
        aria-describedby={`${pathDescriptionId}${tooltip ? ` ${tooltipId}` : ""}`}
        onClick={() => onSelect(entry.id)}
        onFocus={(event) => showTooltip(event.currentTarget, entry.title)}
        onBlur={() => setTooltip(null)}
        onMouseOver={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.dataset.tooltip
          ) {
            showTooltip(event.target, event.target.dataset.tooltip);
          }
        }}
        onMouseOut={() => setTooltip(null)}
      >
        <span className="entry-copy">
          <strong data-tooltip={entry.title}>{entry.title}</strong>
          <small data-tooltip={entry.absPath}>{fileName(entry.absPath)}</small>
          <span className="visually-hidden" id={pathDescriptionId}>
            {entry.absPath}
          </span>
          {tooltip && (
            <span
              className="browser-tooltip entry-tooltip"
              role="tooltip"
              id={tooltipId}
              style={{ left: tooltip.left, top: tooltip.top }}
            >
              {tooltip.text}
            </span>
          )}
        </span>
      </button>
      <span className="entry-actions">
        <button
          className="entry-path-copy icon-button"
          data-status-description="Copy this file path."
          type="button"
          aria-label={`Copy file path ${entry.absPath}`}
          onClick={() => onCopyPath(entry.absPath)}
        >
          <Icon name={isSelected ? "linkAccent" : "link"} size={12} />
        </button>
        <button
          className="entry-remove icon-button"
          data-status-description="Remove this file from the session."
          type="button"
          aria-label={`Remove ${entry.title}`}
          onClick={() => onRemove(entry.id)}
        >
          <Icon name={isSelected ? "trashAccent" : "trash"} size={12} />
        </button>
      </span>
    </li>
  );

  function showTooltip(target: HTMLElement, text: string): void {
    const bounds = target.getBoundingClientRect();
    setTooltip({
      text,
      left: Math.max(12, bounds.left),
      top: bounds.bottom + 8,
    });
  }
}
