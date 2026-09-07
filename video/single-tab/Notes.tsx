import { eyebrow, heading } from "./document-style";
import { MONO } from "./style";

/** Presents the design working notes.
 * @returns The HTML preview content.
 */
export function Notes() {
  return (
    <>
      <div style={eyebrow}>DESIGN / WORKING NOTES</div>
      <h2 style={{ ...heading, fontFamily: "Georgia, serif", fontSize: 54 }}>
        Less, but useful.
      </h2>
      <p
        style={{
          fontSize: 19,
          lineHeight: 1.8,
          color: "#777468",
          maxWidth: 620,
        }}
      >
        A small set of decisions for a focused workspace.
      </p>
      {[
        [
          "01",
          "Keep the work in view.",
          "Let the document take the space it needs.",
        ],
        [
          "02",
          "Make the next action obvious.",
          "A clear list. A familiar folder. A quick search.",
        ],
        [
          "03",
          "Leave room to think.",
          "Remove friction from the everyday workflow.",
        ],
      ].map(([n, title, text]) => (
        <div
          key={n}
          style={{
            display: "flex",
            gap: 25,
            borderTop: "1px solid #dedbd3",
            padding: "25px 0",
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 14,
              color: "#969083",
              paddingTop: 5,
            }}
          >
            {n}
          </span>
          <div>
            <div style={{ fontSize: 23, fontWeight: 550 }}>{title}</div>
            <div style={{ fontSize: 16, color: "#777468", marginTop: 9 }}>
              {text}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
