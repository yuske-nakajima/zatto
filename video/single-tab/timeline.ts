/** Full-HD, twenty-second single-tab promotion. */
export const SINGLE_TAB_SPEC = {
  id: "ZattoSingleTab",
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 600,
};

/** HTML documents shared by list, folders, search and preview. */
export const DOCUMENTS = {
  diagram: {
    title: "System architecture",
    file: "diagram.html",
    path: "/workspace/diagram.html",
  },
  notes: {
    title: "Design notes",
    file: "notes.html",
    path: "/workspace/design/notes.html",
  },
  release: {
    title: "Release checklist",
    file: "release.html",
    path: "/workspace/design/release.html",
  },
  report: {
    title: "Weekly report",
    file: "report.html",
    path: "/workspace/report.html",
  },
};

/** A document identifier in the filmed session. */
export type DocumentId = keyof typeof DOCUMENTS;

/** Frame-derived UI state; all visible actions share this clock. */
export interface FilmState {
  submitted: boolean;
  added: boolean;
  selected: DocumentId;
  folders: boolean;
  folderExpanded: boolean;
  searchVisible: boolean;
  query: string;
}

/**
 * Resolves the session at a frame without browser timing or mutable state.
 * @param frame - Nonnegative integer frame number.
 * @returns The CLI, file panel and preview state.
 * @throws RangeError for invalid frame numbers.
 */
export function getFilmState(frame: number): FilmState {
  if (!Number.isInteger(frame) || frame < 0)
    throw new RangeError("Frame must be a nonnegative integer");
  return {
    submitted: frame >= 134,
    added: frame >= 137,
    selected:
      frame >= 478
        ? "release"
        : frame >= 360
          ? "notes"
          : frame >= 234
            ? "diagram"
            : frame >= 166
              ? "report"
              : "diagram",
    folders: frame >= 313,
    folderExpanded: frame >= 345,
    searchVisible: frame >= 403 && frame < 478,
    query: "release".slice(
      0,
      Math.max(0, Math.min(7, Math.floor((frame - 415) / 4))),
    ),
  };
}
