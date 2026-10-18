/** Documents shared by list, folders, search and preview. */
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
  plan: {
    title: "Release plan",
    file: "plan.md",
    path: "/workspace/plan.md",
  },
};

/** A document identifier in the filmed session. */
export type DocumentId = keyof typeof DOCUMENTS;

/** Review thread progress on the Markdown plan. */
export interface FilmReview {
  /** Share of the commented sentence covered by the drag selection, 0 to 1. */
  selection: number;
  /** The selection's Comment button is visible. */
  selectionButton: boolean;
  /** The thread popover is open. */
  open: boolean;
  /** Characters of the comment typed into the form. */
  typed: number;
  /** The comment has been sent and shows as a bubble. */
  sent: boolean;
  /** The AI's reply has arrived. */
  replied: boolean;
  /** The commented sentence shows the AI's edit. */
  revised: boolean;
}

/** Frame-derived UI state; all visible actions share this clock. */
export interface FilmState {
  added: boolean;
  selected: DocumentId;
  folders: boolean;
  searchVisible: boolean;
  query: string;
  /** The session is in review with the AI. */
  reviewing: boolean;
  review: FilmReview;
}

/** Frames where the filmed actions happen; the cursor clicks on the same frames. */
export const CUE = {
  added: 150,
  openPlan: 180,
  selectStart: 236,
  selectEnd: 262,
  selectionButton: 266,
  openThread: 278,
  typeStart: 290,
  typeEnd: 335,
  send: 345,
  reply: 400,
  revise: 424,
  closeThread: 512,
  folders: 540,
  notes: 568,
  search: 592,
  queryStart: 598,
} as const;

/**
 * Resolves the session at a frame without browser timing or mutable state.
 * @param frame - Nonnegative integer frame number.
 * @param commentLength - Characters in the localized comment.
 * @returns The panel, preview and review state.
 * @throws RangeError for invalid frame numbers.
 */
export function getFilmState(frame: number, commentLength = 1): FilmState {
  if (!Number.isInteger(frame) || frame < 0)
    throw new RangeError("Frame must be a nonnegative integer");
  const typing = (frame - CUE.typeStart) / (CUE.typeEnd - CUE.typeStart);
  return {
    added: frame >= CUE.added,
    selected:
      frame >= CUE.notes ? "notes" : frame >= CUE.openPlan ? "plan" : "diagram",
    folders: frame >= CUE.folders,
    searchVisible: frame >= CUE.search,
    query: "release".slice(
      0,
      Math.max(0, Math.min(7, Math.floor((frame - CUE.queryStart) / 4))),
    ),
    reviewing: frame >= CUE.openPlan,
    review: {
      selection: Math.max(
        0,
        Math.min(
          1,
          (frame - CUE.selectStart) / (CUE.selectEnd - CUE.selectStart),
        ),
      ),
      selectionButton:
        frame >= CUE.selectionButton && frame < CUE.openThread + 2,
      open: frame >= CUE.openThread && frame < CUE.closeThread,
      typed: Math.max(
        0,
        Math.min(commentLength, Math.ceil(typing * commentLength)),
      ),
      sent: frame >= CUE.send,
      replied: frame >= CUE.reply,
      revised: frame >= CUE.revise,
    },
  };
}
