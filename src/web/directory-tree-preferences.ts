const COLLAPSED_DIRECTORY_PATHS_KEY = "zatto:collapsed-directory-paths";

/**
 * Reads saved directory expansion preferences.
 * @returns The collapsed paths, or an empty set when storage is unavailable
 * @throws Never
 */
export function readCollapsedDirectoryPaths(): Set<string> {
  try {
    const storedValue = window.localStorage.getItem(
      COLLAPSED_DIRECTORY_PATHS_KEY,
    );
    if (storedValue === null) {
      return new Set();
    }
    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return new Set();
    }
    return new Set(
      parsedValue.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set();
  }
}

/**
 * Persists directory expansion preferences.
 * @param paths - Collapsed directory paths
 * @returns Nothing
 * @throws Never; unavailable browser storage leaves preferences in memory
 */
export function storeCollapsedDirectoryPaths(paths: Set<string>): void {
  try {
    window.localStorage.setItem(
      COLLAPSED_DIRECTORY_PATHS_KEY,
      JSON.stringify([...paths]),
    );
  } catch {
    return;
  }
}
