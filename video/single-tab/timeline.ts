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

/** The filmed cut: the short README and X promotion, or the longer feature tour. */
export type FilmVariant = "short" | "tour";

/** File panel tab shown in the sidebar. */
export type PanelView = "list" | "folders" | "favorites";

/** Workspace shown in the session; the tour switches to the second one. */
export type FilmWorkspace = "product" | "launch";

/** Frame-derived UI state; all visible actions share this clock. */
export interface FilmState {
  added: boolean;
  /** Entries in the List view, in the order they were added. */
  entries: DocumentId[];
  selected: DocumentId;
  view: PanelView;
  searchVisible: boolean;
  query: string;
  /** The session is in review with the AI. */
  reviewing: boolean;
  review: FilmReview;
  /** The last task of the plan is checked from the preview. */
  taskDone: boolean;
  /** The report carries a favorite star. */
  favorite: boolean;
  workspace: FilmWorkspace;
  /** The workspace menu is open. */
  workspaceMenu: boolean;
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

/** Frames of the scenes the tour adds after the review thread closes. */
export const TOUR = {
  checkTask: 560,
  cliTypeStart: 632,
  cliSubmit: 668,
  cliAdded: 672,
  openReport: 700,
  star: 750,
  favorites: 780,
  folders: 830,
  notes: 865,
  search: 910,
  queryStart: 916,
  workspaceMenu: 1000,
  workspace: 1025,
} as const;

/** Composition length of each cut, in frames at 30 fps. */
export const FILM_FRAMES: Record<FilmVariant, number> = {
  short: 750,
  tour: 1200,
};

const BASE: DocumentId[] = ["diagram", "notes", "release"];

function review(frame: number, commentLength: number): FilmReview {
  const typing = (frame - CUE.typeStart) / (CUE.typeEnd - CUE.typeStart);
  return {
    selection: Math.max(
      0,
      Math.min(
        1,
        (frame - CUE.selectStart) / (CUE.selectEnd - CUE.selectStart),
      ),
    ),
    selectionButton: frame >= CUE.selectionButton && frame < CUE.openThread + 2,
    open: frame >= CUE.openThread && frame < CUE.closeThread,
    typed: Math.max(
      0,
      Math.min(commentLength, Math.ceil(typing * commentLength)),
    ),
    sent: frame >= CUE.send,
    replied: frame >= CUE.reply,
    revised: frame >= CUE.revise,
  };
}

function typedQuery(frame: number, start: number): string {
  return "release".slice(
    0,
    Math.max(0, Math.min(7, Math.floor((frame - start) / 4))),
  );
}

function shortState(frame: number, commentLength: number): FilmState {
  const added = frame >= CUE.added;
  return {
    added,
    entries: added ? [...BASE, "report", "plan"] : [...BASE, "report"],
    selected:
      frame >= CUE.notes ? "notes" : frame >= CUE.openPlan ? "plan" : "diagram",
    view: frame >= CUE.folders ? "folders" : "list",
    searchVisible: frame >= CUE.search,
    query: typedQuery(frame, CUE.queryStart),
    reviewing: frame >= CUE.openPlan,
    review: review(frame, commentLength),
    taskDone: false,
    favorite: false,
    workspace: "product",
    workspaceMenu: false,
  };
}

function tourState(frame: number, commentLength: number): FilmState {
  const added = frame >= CUE.added;
  const cliAdded = frame >= TOUR.cliAdded;
  const workspace = frame >= TOUR.workspace ? "launch" : "product";
  const entries: DocumentId[] =
    workspace === "launch"
      ? ["release", "notes"]
      : [
          ...BASE,
          ...(added ? (["plan"] as const) : []),
          ...(cliAdded ? (["report"] as const) : []),
        ];
  return {
    added,
    entries,
    selected:
      workspace === "launch"
        ? "release"
        : frame >= TOUR.notes
          ? "notes"
          : frame >= TOUR.openReport
            ? "report"
            : frame >= CUE.openPlan
              ? "plan"
              : "diagram",
    view:
      workspace === "launch" || frame < TOUR.favorites
        ? "list"
        : frame < TOUR.folders
          ? "favorites"
          : "folders",
    searchVisible: frame >= TOUR.search && workspace === "product",
    query: typedQuery(frame, TOUR.queryStart),
    reviewing: frame >= CUE.openPlan,
    review: review(frame, commentLength),
    taskDone: frame >= TOUR.checkTask,
    favorite: frame >= TOUR.star,
    workspace,
    workspaceMenu: frame >= TOUR.workspaceMenu && frame < TOUR.workspace,
  };
}

/**
 * Resolves the session at a frame without browser timing or mutable state.
 * @param frame - Nonnegative integer frame number.
 * @param commentLength - Characters in the localized comment.
 * @param variant - The cut being filmed.
 * @returns The panel, preview and review state.
 * @throws RangeError for invalid frame numbers.
 */
export function getFilmState(
  frame: number,
  commentLength = 1,
  variant: FilmVariant = "short",
): FilmState {
  if (!Number.isInteger(frame) || frame < 0)
    throw new RangeError("Frame must be a nonnegative integer");
  return variant === "tour"
    ? tourState(frame, commentLength)
    : shortState(frame, commentLength);
}
