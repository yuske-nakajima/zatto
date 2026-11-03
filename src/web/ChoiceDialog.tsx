import { useId, useState } from "react";
import { DialogFrame } from "./DialogFrame.js";

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
  const groupName = useId();
  const [selectedValue, setSelectedValue] = useState(options[0]?.value);

  return (
    <DialogFrame title={title} description={description} onCancel={onCancel}>
      {(close) => (
        <>
          <fieldset>
            <legend className="visually-hidden">{title} options</legend>
            {options.map((option) => (
              <label className="choice-dialog-option" key={option.value}>
                <input
                  type="radio"
                  name={groupName}
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
            <button type="button" onClick={() => close(onCancel)}>
              Cancel
            </button>
            <button
              className="choice-dialog-confirm"
              type="button"
              disabled={selectedValue === undefined}
              onClick={() => {
                const value = selectedValue;
                if (value !== undefined) close(() => onConfirm(value));
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </DialogFrame>
  );
}
