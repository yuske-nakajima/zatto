/** Describes whether a server-managed native picker can be opened. */
export interface NativePickerCapability {
  available: boolean;
  instanceId: string | null;
}

/** Groups the native file and directory picker capabilities. */
export interface NativePickerCapabilities {
  files: NativePickerCapability;
  directory: NativePickerCapability;
}

interface SessionPickerFields {
  filePicker?: {
    available?: boolean;
    instanceId?: string;
  };
  directoryPicker?: {
    available?: boolean;
    instanceId?: string;
  };
}

/**
 * Normalizes picker capability fields from the session response.
 *
 * @param session - Session response fields describing native pickers
 * @returns File and directory picker capabilities with explicit fallbacks
 */
export function readNativePickerCapabilities(
  session: SessionPickerFields,
): NativePickerCapabilities {
  return {
    files: normalizeCapability(session.filePicker),
    directory: normalizeCapability(session.directoryPicker),
  };
}

function normalizeCapability(
  capability: SessionPickerFields["filePicker"],
): NativePickerCapability {
  return {
    available: capability?.available === true,
    instanceId: capability?.instanceId ?? null,
  };
}
