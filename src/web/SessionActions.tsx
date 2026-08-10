import type { ChangeEvent } from "react";

interface SessionActionsProps {
  isAvailable: boolean;
  isPending: boolean;
  onImport: (file: File) => Promise<void>;
  onExport: () => void;
}

/**
 * Renders browser controls for importing and exporting a session document.
 *
 * @param props - Transfer state and session file callbacks
 * @returns Session file management controls
 */
export function SessionActions({
  isAvailable,
  isPending,
  onImport,
  onExport,
}: SessionActionsProps) {
  const isDisabled = !isAvailable || isPending;
  async function importSelectedFile(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) await onImport(file);
    input.value = "";
  }

  return (
    <section className="session-actions" aria-label="Session file management">
      <span className="session-action-buttons">
        <label
          className={`session-action-button${
            isDisabled ? " session-action-button--disabled" : ""
          }`}
          aria-disabled={isDisabled}
          data-status-description="Replace this session from a JSON file."
        >
          {isPending ? "Importing…" : "Import session…"}
          <input
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label="Import session file"
            disabled={isDisabled}
            onChange={importSelectedFile}
          />
        </label>
        <button
          className="session-action-button"
          data-status-description="Download this session as a JSON file."
          type="button"
          disabled={isDisabled}
          onClick={onExport}
        >
          Export session…
        </button>
      </span>
      <p>
        Session exports contain absolute paths and local information. Do not
        share them.
      </p>
    </section>
  );
}
