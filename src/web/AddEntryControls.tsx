import { useRef, useState } from "react";
import { ChoiceDialog } from "./ChoiceDialog.js";
import type {
  DirectoryPickerMode,
  NativePickerPending,
} from "./useNativeEntryPicker.js";

interface AddEntryControlsProps {
  canPickFiles: boolean;
  canPickDirectory: boolean;
  pending: NativePickerPending;
  onPickFiles: () => void;
  onPickDirectory: (mode: DirectoryPickerMode) => void;
}

/**
 * Renders file and folder controls for adding HTML entries.
 *
 * @param props - Picker availability, pending state, and picker callbacks
 * @returns Entry addition controls and the folder scope dialog
 */
export function AddEntryControls({
  canPickFiles,
  canPickDirectory,
  pending,
  onPickFiles,
  onPickDirectory,
}: AddEntryControlsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isPending = pending !== null;

  function closeDialog(): void {
    setIsDialogOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function confirmDirectory(mode: DirectoryPickerMode): void {
    if (isPending) return;
    closeDialog();
    onPickDirectory(mode);
  }

  return (
    <>
      {canPickFiles && (
        <button
          className="add-button"
          data-status-description="Add HTML files to this session."
          type="button"
          aria-label="Add HTML files"
          disabled={isPending}
          onClick={onPickFiles}
        >
          {pending === "files" ? "Opening…" : "+ Add"}
        </button>
      )}
      {canPickDirectory && (
        <button
          ref={triggerRef}
          className="add-button add-folder-button"
          data-status-description="Add HTML files from a folder to this session."
          type="button"
          aria-label="Add folder"
          disabled={isPending}
          onClick={() => setIsDialogOpen(true)}
        >
          {pending === "directory" ? "Opening…" : "Add folder…"}
        </button>
      )}
      {isDialogOpen && (
        <ChoiceDialog
          title="Add HTML files from a folder"
          description="Choose how deeply zatto should look inside the selected folder."
          options={DIRECTORY_SCOPE_OPTIONS}
          confirmLabel="Choose folder"
          onConfirm={confirmDirectory}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}

const DIRECTORY_SCOPE_OPTIONS = [
  {
    value: "direct",
    label: "Direct children",
    description: "Add HTML files directly inside the selected folder.",
  },
  {
    value: "recursive",
    label: "Entire folder tree",
    description: "Add HTML files in the selected folder and its subfolders.",
  },
] as const;
