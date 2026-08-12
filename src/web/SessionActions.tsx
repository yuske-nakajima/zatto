import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ChoiceDialog } from "./ChoiceDialog.js";
import type {
  SessionExportOrder,
  SessionImportMode,
  SessionTransferPending,
} from "./useSessionTransfer.js";

interface SessionActionsProps {
  isAvailable: boolean;
  pending: SessionTransferPending;
  onImport: (file: File, mode: SessionImportMode) => Promise<void>;
  onExport: (order: SessionExportOrder) => void;
}

/**
 * Renders browser controls for importing and exporting a session document.
 *
 * @param props - Transfer state and session file callbacks
 * @returns Session file management controls
 */
export function SessionActions({
  isAvailable,
  pending,
  onImport,
  onExport,
}: SessionActionsProps) {
  const [dialog, setDialog] = useState<
    { kind: "import"; file: File } | { kind: "export" } | null
  >(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previousPendingRef = useRef(pending);
  const isPending = pending !== null;

  useEffect(() => {
    if (previousPendingRef.current !== null && pending === null) {
      returnFocusRef.current?.focus();
    }
    previousPendingRef.current = pending;
  }, [pending]);

  function importSelectedFile(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file && !dialog && !isPending) {
      returnFocusRef.current = input;
      setDialog({ kind: "import", file });
    }
    input.value = "";
  }

  function openExportDialog(): void {
    if (dialog || isPending) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDialog({ kind: "export" });
  }

  function closeDialog(): void {
    setDialog(null);
    queueMicrotask(() => returnFocusRef.current?.focus());
  }

  function confirmImport(mode: SessionImportMode): void {
    if (dialog?.kind !== "import") return;
    const file = dialog.file;
    closeDialog();
    void onImport(file, mode);
  }

  function confirmExport(order: SessionExportOrder): void {
    if (dialog?.kind !== "export") return;
    closeDialog();
    onExport(order);
  }

  return (
    <section className="session-actions" aria-label="Session file management">
      {isAvailable ? (
        <span className="session-action-buttons">
          <label
            className={`session-action-button${
              isPending ? " session-action-button--disabled" : ""
            }`}
            aria-disabled={isPending}
            data-status-description="Replace this session from a JSON file."
          >
            {pending === "import" && <SessionActionSpinner />}
            {pending === "import" ? <em>Importing…</em> : "Import session…"}
            <input
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              aria-label="Import session file"
              disabled={isPending}
              onChange={importSelectedFile}
            />
          </label>
          <span className="session-action-separator" aria-hidden="true">
            •
          </span>
          <button
            className="session-action-button"
            data-status-description="Download this session as a JSON file."
            type="button"
            disabled={isPending}
            onClick={openExportDialog}
          >
            {pending === "export" && <SessionActionSpinner />}
            {pending === "export" ? <em>Exporting…</em> : "Export session…"}
          </button>
        </span>
      ) : (
        <span className="session-action-loading" role="status">
          <SessionActionSpinner />
          loading…
        </span>
      )}
      <p>
        Session exports contain absolute paths and local information. Do not
        share them.
      </p>
      {dialog?.kind === "import" && (
        <ChoiceDialog
          title="Import session"
          description="Choose how to add entries from the selected file."
          options={IMPORT_OPTIONS}
          confirmLabel="Import"
          onConfirm={confirmImport}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "export" && (
        <ChoiceDialog
          title="Export session"
          description="Choose the entry order for the exported file."
          options={EXPORT_OPTIONS}
          confirmLabel="Export"
          onConfirm={confirmExport}
          onCancel={closeDialog}
        />
      )}
    </section>
  );
}

const IMPORT_OPTIONS = [
  { value: "replace", label: "Replace current list" },
  { value: "merge", label: "Merge with current list" },
] as const;

const EXPORT_OPTIONS = [
  { value: "keep", label: "Keep current order" },
  { value: "sort", label: "Sort by path" },
] as const;

function SessionActionSpinner() {
  return <span className="session-action-spinner" aria-hidden="true" />;
}
