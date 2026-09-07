import { FONT, MONO, move } from "./style";

const COMMAND = "npx @yuske-nakajima/zatto \\\n  report.html";

/**
 * Types a scoped npm command beside the receiving browser.
 * @param props - Global film frame.
 * @returns A terminal window with submission synchronized to session insertion.
 */
export function FilmTerminal({ frame }: { frame: number }) {
  const opacity = move(frame, 78, 91) * move(frame, 195, 215, 1, 0);
  const command = COMMAND.slice(
    0,
    Math.max(0, Math.floor(((frame - 94) / 36) * COMMAND.length)),
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
          workspace — zsh
        </span>
      </div>
      <div
        style={{
          padding: "22px 26px",
          fontFamily: MONO,
          fontSize: 23,
          lineHeight: 1.5,
        }}
      >
        <div style={{ color: "#9298a6", fontSize: 14, marginBottom: 10 }}>
          ~/workspace
        </div>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <span style={{ color: "#a5b4fc", marginRight: 13 }}>❯</span>
          <span style={{ color: "#f8fafc", whiteSpace: "pre" }}>
            {command}
            {frame < 134 && (
              <span
                style={{
                  display: "inline-block",
                  width: 11,
                  height: 24,
                  verticalAlign: "middle",
                  background: "#a5b4fc",
                  opacity: frame % 24 < 16 ? 1 : 0,
                }}
              />
            )}
          </span>
        </div>
        <div style={{ opacity: move(frame, 134, 139), marginTop: 12 }}>
          <div style={{ color: "#a5b4fc", fontSize: 15, marginBottom: 8 }}>
            http://localhost:6280/
          </div>
          <span style={{ color: "#a5b4fc" }}>❯</span>
          <span
            style={{
              display: "inline-block",
              marginLeft: 15,
              width: 11,
              height: 24,
              verticalAlign: "middle",
              background: "#a5b4fc",
              opacity: frame % 28 < 19 ? 1 : 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}
