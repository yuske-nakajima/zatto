import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export interface ChoiceDialogOption<Value extends string> {
  value: Value;
  label: string;
  description?: string;
}

interface ChoiceDialogProps<Value extends string> {
  title: string;
  description: string;
  options: readonly ChoiceDialogOption<Value>[];
  confirmLabel: string;
  onConfirm: (value: Value) => void;
  onCancel: () => void;
}

export function ChoiceDialog<Value extends string>({
  title,
  description,
  options,
  confirmLabel,
  onConfirm,
  onCancel,
}: ChoiceDialogProps<Value>) {
  const titleId = useId();
  const descriptionId = useId();
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selectedValue, setSelectedValue] = useState(options[0]?.value);

  useEffect(() => firstOptionRef.current?.focus(), []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="choice-dialog-backdrop">
      <div
        ref={dialogRef}
        className="choice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <fieldset>
          <legend className="visually-hidden">{title} options</legend>
          {options.map((option, index) => (
            <label className="choice-dialog-option" key={option.value}>
              <input
                ref={index === 0 ? firstOptionRef : undefined}
                type="radio"
                name={titleId}
                value={option.value}
                checked={selectedValue === option.value}
                onChange={() => setSelectedValue(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="choice-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="choice-dialog-confirm"
            type="button"
            disabled={selectedValue === undefined}
            onClick={() => selectedValue && onConfirm(selectedValue)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
