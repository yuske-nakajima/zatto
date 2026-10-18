import { panelLayout } from "./Panel";
import { move } from "./style";
import { SELECTION_BUTTON, THREAD_BOX } from "./Thread";
import { CUE, type FilmVariant, TOUR } from "./timeline";

const SEND = {
  x: THREAD_BOX.left + THREAD_BOX.width - 70,
  y: THREAD_BOX.top + 160,
};

/** [frame, x, y] keys in browser-local coordinates, shared by both cuts until the reply. */
const REVIEW_POINTS = [
  [150, 720, 600],
  [164, 720, 600],
  [CUE.openPlan - 2, 170, 640],
  [CUE.openPlan + 6, 170, 640],
  [CUE.selectStart - 2, 392, 434],
  [CUE.selectStart, 392, 434],
  [CUE.selectEnd, 655, 434],
  [CUE.selectionButton + 2, 655, 434],
  [CUE.openThread - 2, SELECTION_BUTTON.left + 50, SELECTION_BUTTON.top + 18],
  [CUE.send - 10, SELECTION_BUTTON.left + 50, SELECTION_BUTTON.top + 18],
  [CUE.send - 2, SEND.x, SEND.y],
  [CUE.send + 6, SEND.x, SEND.y],
  [CUE.reply - 10, 1060, 720],
  [CUE.closeThread, 1060, 720],
];

const SHORT_POINTS = [
  ...REVIEW_POINTS,
  [CUE.folders - 3, 210, 290],
  [CUE.folders + 6, 210, 290],
  [CUE.notes - 3, 200, 668],
  [CUE.notes + 6, 200, 668],
  [CUE.search - 3, 305, 290],
  [CUE.search + 10, 305, 290],
];

const tour = panelLayout(true);
const tourRow = (index: number) =>
  tour.rowsTop + tour.rowHeight * (index + 0.5);
const tourTab = (index: number) =>
  ((330 - tour.searchWidth) / 3) * (index + 0.5);
/** Center of the second workspace menu option, below the workspace control. */
const LAUNCH_OPTION_Y =
  tour.workspaceY + tour.workspaceHeight / 2 - 1 + 34 * 1.5;
/** The plan's last task checkbox in the zoomed preview. */
const TASK = { x: 433, y: 651 };

const TOUR_POINTS = [
  ...REVIEW_POINTS,
  [TOUR.checkTask - 3, TASK.x, TASK.y],
  [TOUR.checkTask + 10, TASK.x, TASK.y],
  [TOUR.cliAdded + 6, 700, 560],
  [TOUR.openReport - 3, 150, tourRow(4)],
  [TOUR.openReport + 8, 150, tourRow(4)],
  [TOUR.star - 3, 249, tourRow(4)],
  [TOUR.star + 6, 249, tourRow(4)],
  [TOUR.favorites - 3, tourTab(2), tour.tabY],
  [TOUR.favorites + 6, tourTab(2), tour.tabY],
  [TOUR.folders - 3, tourTab(1), tour.tabY],
  [TOUR.folders + 6, tourTab(1), tour.tabY],
  [TOUR.notes - 3, 160, tour.rowsTop + 40 * 2 + tour.rowHeight * 3.5],
  [TOUR.notes + 6, 160, tour.rowsTop + 40 * 2 + tour.rowHeight * 3.5],
  [TOUR.search - 3, 330 - tour.searchWidth / 2, tour.tabY],
  [TOUR.search + 10, 330 - tour.searchWidth / 2, tour.tabY],
  [TOUR.workspaceMenu - 3, 200, tour.workspaceY],
  [TOUR.workspaceMenu + 6, 200, tour.workspaceY],
  [TOUR.workspace - 3, 200, LAUNCH_OPTION_Y],
  [TOUR.workspace + 10, 200, LAUNCH_OPTION_Y],
];

const CLICKS: Record<FilmVariant, number[]> = {
  short: [
    CUE.openPlan,
    CUE.openThread,
    CUE.send,
    CUE.folders,
    CUE.notes,
    CUE.search,
  ],
  tour: [
    CUE.openPlan,
    CUE.openThread,
    CUE.send,
    TOUR.checkTask,
    TOUR.openReport,
    TOUR.star,
    TOUR.favorites,
    TOUR.folders,
    TOUR.notes,
    TOUR.search,
    TOUR.workspaceMenu,
    TOUR.workspace,
  ],
};

/** Frames where the pointer fades out before the end card, per cut. */
const HIDE: Record<FilmVariant, number> = { short: 615, tour: 1050 };

/**
 * Moves the pointer in browser-local coordinates and marks click frames.
 * @param props - Global film frame and the cut being filmed.
 * @returns A pointer and a restrained expanding click ring.
 */
export function FilmCursor({
  frame,
  variant,
}: {
  frame: number;
  variant: FilmVariant;
}) {
  const points = variant === "tour" ? TOUR_POINTS : SHORT_POINTS;
  const clicks = CLICKS[variant];
  let x = points[0][1];
  let y = points[0][2];
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1];
    const after = points[i];
    if (frame >= before[0]) {
      x = move(frame, before[0], after[0], before[1], after[1]);
      y = move(frame, before[0], after[0], before[2], after[2]);
    }
  }
  const click = clicks.find((at) => frame >= at && frame < at + 14);
  const ring = click === undefined ? 0 : (frame - click) / 14;
  const opacity =
    move(frame, 150, 160) *
    move(frame, HIDE[variant], HIDE[variant] + 11, 1, 0);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        pointerEvents: "none",
      }}
    >
      {click !== undefined && (
        <div
          style={{
            position: "absolute",
            left: -20,
            top: -20,
            width: 40,
            height: 40,
            border: "2px solid #6366f1",
            borderRadius: 40,
            opacity: 1 - ring,
            transform: `scale(${0.35 + ring})`,
          }}
        />
      )}
      <svg
        width="27"
        height="34"
        viewBox="0 0 27 34"
        aria-hidden="true"
        style={{
          filter: "drop-shadow(0 2px 2px #0004)",
          transform: `scale(${click === undefined ? 1 : 0.92 + ring * 0.08})`,
          transformOrigin: "top left",
        }}
      >
        <path
          d="M2 2v26l7-7 6 11 5-3-6-10 10-1Z"
          fill="#141821"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
