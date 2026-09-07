import { move } from "./style";

const points = [
  [140, 180, 655],
  [161, 170, 575],
  [190, 170, 575],
  [228, 165, 359],
  [282, 165, 359],
  [307, 209, 290],
  [319, 209, 290],
  [337, 125, 527],
  [350, 125, 527],
  [356, 166, 583],
  [382, 166, 583],
  [397, 305, 290],
  [403, 305, 290],
  [412, 590, 128],
  [448, 590, 128],
  [470, 680, 318],
  [492, 680, 318],
];
const clicks = [166, 234, 313, 345, 360, 403, 478];

/**
 * Moves the pointer in browser-local coordinates and marks click frames.
 * @param props - Global film frame.
 * @returns A pointer and a restrained expanding click ring.
 */
export function FilmCursor({ frame }: { frame: number }) {
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
  const opacity = move(frame, 141, 151) * move(frame, 489, 502, 1, 0);
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
