import type { FilmCopy } from "./copy";
import { FONT, MONO, move } from "./style";
import { CUE } from "./timeline";

const TYPE_START = 104;
const TYPE_END = 128;
const WROTE = 136;
const SHARED = CUE.added - 4;

/**
 * An AI coding session beside the browser: a request, the written file and the share to zatto.
 * @param props - Global film frame and localized copy.
 * @returns A terminal window whose last line lands with the session insertion.
 */
export function FilmTerminal({
  frame,
  copy,
}: {
  frame: number;
  copy: FilmCopy;
}) {
  const opacity = move(frame, 78, 91) * move(frame, 195, 215, 1, 0);
  const typed = copy.prompt.slice(
    0,
    Math.max(
      0,
      Math.ceil(
        ((frame - TYPE_START) / (TYPE_END - TYPE_START)) * copy.prompt.length,
      ),
    ),
  );
  const line = (at: number, text: string) => (
    <div
      style={{
        opacity: move(frame, at, at + 6),
        display: "flex",
        gap: 12,
        marginTop: 14,
        fontSize: 19,
      }}
    >
      <span style={{ color: "#34d399" }}>●</span>
      <span>{text}</span>
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 62 + move(frame, 195, 215, 0, -50),
        top: 372 + move(frame, 78, 96, 24, 0),
        width: 478,
        height: 290,
        borderRadius: 11,
        background: "#17191f",
        color: "#e5e7eb",
        overflow: "hidden",
        opacity,
        boxShadow: "0 22px 55px #10162730",
        border: "1px solid #363942",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 42,
          background: "#22252d",
          padding: "0 15px",
          borderBottom: "1px solid #343740",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff6058", "#febc2e", "#28c840"].map((color) => (
            <span
              key={color}
              style={{
                width: 9,
                height: 9,
                background: color,
                borderRadius: 9,
              }}
            />
          ))}
        </div>
        <span
          style={{
            margin: "0 auto",
            color: "#989ca7",
            fontFamily: FONT,
            fontSize: 12,
          }}
        >
          AI agent — workspace
        </span>
      </div>
      <div
        style={{
          padding: "22px 26px",
          fontFamily: `${MONO}, ${FONT}`,
          fontSize: 20,
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <span style={{ color: "#a5b4fc", marginRight: 13 }}>❯</span>
          <span style={{ color: "#f8fafc" }}>
            {typed}
            {frame < WROTE && (
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 22,
                  verticalAlign: "middle",
                  background: "#a5b4fc",
                  opacity: frame % 24 < 16 ? 1 : 0,
                }}
              />
            )}
          </span>
        </div>
        {line(WROTE, copy.wrote)}
        {line(SHARED, copy.shared)}
      </div>
    </div>
  );
}
