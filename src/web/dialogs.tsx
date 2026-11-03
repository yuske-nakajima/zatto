import { type FormEvent, useRef, useState, useSyncExternalStore } from "react";
import { DialogFrame, type DialogTone } from "./DialogFrame.js";

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: DialogTone;
}

export interface PromptDialogOptions {
  title: string;
  message: string;
  label: string;
  confirmLabel: string;
  defaultValue?: string;
  maxLength?: number;
}

type DialogRequest =
  | {
      kind: "confirm";
      key: number;
      options: ConfirmDialogOptions;
      resolve: (confirmed: boolean) => void;
    }
  | {
      kind: "prompt";
      key: number;
      options: PromptDialogOptions;
      resolve: (value: string | null) => void;
    };

let current: DialogRequest | null = null;
let nextKey = 0;
const listeners = new Set<() => void>();

function show(request: DialogRequest): void {
  // 表示中の要求は取り消し扱いにして、呼び出し元の Promise を確定させる。
  cancel(current);
  current = request;
  for (const listener of listeners) listener();
}

function cancel(request: DialogRequest | null): void {
  if (!request) return;
  if (request.kind === "confirm") request.resolve(false);
  else request.resolve(null);
}

function settle(request: DialogRequest): void {
  if (current !== request) return;
  current = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Asks the user to confirm an action in the in-page dialog.
 * @param options - Dialog text and tone
 * @returns Whether the user confirmed; false when cancelled or replaced by another dialog
 * @throws Never
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) =>
    show({ kind: "confirm", key: nextKey++, options, resolve }),
  );
}

/**
 * Asks the user for a single line of text in the in-page dialog.
 * @param options - Dialog text, field label, and initial value
 * @returns The entered text, or null when cancelled or replaced by another dialog
 * @throws Never
 */
export function promptDialog(
  options: PromptDialogOptions,
): Promise<string | null> {
  return new Promise((resolve) =>
    show({ kind: "prompt", key: nextKey++, options, resolve }),
  );
}

/**
 * Renders dialogs requested through confirmDialog and promptDialog.
 * @returns The active dialog, or nothing
 * @throws Never
 */
export function DialogHost() {
  const request = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  if (!request) return null;
  return request.kind === "confirm" ? (
    <ConfirmDialog key={request.key} request={request} />
  ) : (
    <PromptDialog key={request.key} request={request} />
  );
}

function ConfirmDialog({
  request,
}: {
  request: Extract<DialogRequest, { kind: "confirm" }>;
}) {
  const { title, message, confirmLabel, tone = "default" } = request.options;
  const finish = (confirmed: boolean) => {
    settle(request);
    request.resolve(confirmed);
  };
  return (
    <DialogFrame
      title={title}
      description={message}
      tone={tone}
      onCancel={() => finish(false)}
    >
      {(close) => (
        <div className="choice-dialog-actions">
          <button type="button" onClick={() => close(() => finish(false))}>
            Cancel
          </button>
          <button
            className="choice-dialog-confirm"
            type="button"
            onClick={() => close(() => finish(true))}
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </DialogFrame>
  );
}

function PromptDialog({
  request,
}: {
  request: Extract<DialogRequest, { kind: "prompt" }>;
}) {
  const { title, message, label, confirmLabel, defaultValue, maxLength } =
    request.options;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const finish = (result: string | null) => {
    settle(request);
    request.resolve(result);
  };
  return (
    <DialogFrame
      title={title}
      description={message}
      initialFocusRef={inputRef}
      onCancel={() => finish(null)}
    >
      {(close) => (
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            close(() => finish(value));
          }}
        >
          <label className="choice-dialog-field">
            <span>{label}</span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              maxLength={maxLength}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <div className="choice-dialog-actions">
            <button type="button" onClick={() => close(() => finish(null))}>
              Cancel
            </button>
            <button className="choice-dialog-confirm" type="submit">
              {confirmLabel}
            </button>
          </div>
        </form>
      )}
    </DialogFrame>
  );
}
