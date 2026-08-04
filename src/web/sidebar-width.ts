export const DEFAULT_SIDEBAR_WIDTH = 260;
export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 480;
export const SIDEBAR_WIDTH_STEP = 8;
export const SIDEBAR_WIDTH_LARGE_STEP = 32;

const SIDEBAR_WIDTH_KEY = "zatto:sidebar-width";

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
  );
}

export function readSidebarWidth(): number {
  try {
    const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (storedWidth === null || storedWidth.trim() === "") {
      return DEFAULT_SIDEBAR_WIDTH;
    }
    return clampSidebarWidth(Number(storedWidth));
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function storeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_WIDTH_KEY,
      String(clampSidebarWidth(width)),
    );
  } catch {
    return;
  }
}
