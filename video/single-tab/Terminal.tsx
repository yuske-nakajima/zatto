import type { ReactNode } from "react";
import type { FilmCopy } from "./copy";
import { FONT, MONO, move } from "./style";
import { CUE, TOUR } from "./timeline";

const TYPE_START = 104;
const TYPE_END = 128;
const WROTE = 136;
const SHARED = CUE.added - 4;
const COMMAND = "npx @yuske-nakajima/zatto \\\n  report.html";

function Caret({ frame, height }: { frame: number; height: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height,
        verticalAlign: "middle",
        background: "#a5b4fc",
        opacity: frame % 24 < 16 ? 1 : 0,
      }}
    />
  );
}

function TerminalWindow({
  title,
  enter,
  leave,
  frame,
  children,
}: {
  title: string;
  enter: number;
  leave: number;
  frame: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 62 + move(frame, leave, leave + 20, 0, -50),
        top: 372 + move(frame, enter, enter + 18, 24, 0),
        width: 478,
        height: 290,
        borderRadius: 11,
        background: "#17191f",
        color: "#e5e7eb",
        overflow: "hidden",
        opacity:
          move(frame, enter, enter + 13) * move(frame, leave, leave + 20, 1, 0),
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
          {title}
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
        {children}
      </div>
    </div>
  );
}

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
    <TerminalWindow
      title="AI agent — workspace"
      enter={78}
      leave={195}
      frame={frame}
    >
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <span style={{ color: "#a5b4fc", marginRight: 13 }}>❯</span>
        <span style={{ color: "#f8fafc" }}>
          {typed}
          {frame < WROTE && <Caret frame={frame} height={22} />}
        </span>
      </div>
      {line(WROTE, copy.wrote)}
      {line(SHARED, copy.shared)}
    </TerminalWindow>
  );
}

/**
 * The tour's shell typing the scoped npm command that adds a file to the open session.
 * @param props - Global film frame.
 * @returns A terminal window whose submission lands with the session insertion.
 */
export function CliTerminal({ frame }: { frame: number }) {
  const command = COMMAND.slice(
    0,
    Math.max(
      0,
      Math.floor(
        ((frame - TOUR.cliTypeStart) /
          (TOUR.cliSubmit - 4 - TOUR.cliTypeStart)) *
          COMMAND.length,
      ),
    ),
  );
  return (
    <TerminalWindow
      title="workspace — zsh"
      enter={TOUR.cliTypeStart - 22}
      leave={TOUR.openReport + 12}
      frame={frame}
    >
      <div style={{ color: "#9298a6", fontSize: 14, marginBottom: 10 }}>
        ~/workspace
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", fontSize: 23 }}>
        <span style={{ color: "#a5b4fc", marginRight: 13 }}>❯</span>
        <span style={{ color: "#f8fafc", whiteSpace: "pre" }}>
          {command}
          {frame < TOUR.cliSubmit && <Caret frame={frame} height={24} />}
        </span>
      </div>
      <div
        style={{
          opacity: move(frame, TOUR.cliSubmit, TOUR.cliSubmit + 5),
          marginTop: 12,
          color: "#a5b4fc",
          fontSize: 15,
        }}
      >
        http://localhost:6280/
      </div>
    </TerminalWindow>
  );
}
