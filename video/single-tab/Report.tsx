import { eyebrow, heading } from "./document-style";
import { INK, MONO } from "./style";

/** Presents weekly activity and totals.
 * @returns The HTML preview content.
 */
export function Report() {
  return (
    <>
      <div style={eyebrow}>PRODUCT / WEEKLY REPORT</div>
      <h2 style={heading}>A clearer picture.</h2>
      <div style={{ color: INK.muted, fontSize: 18 }}>
        September 01 — 07, 2026
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 24,
          borderTop: `1px solid ${INK.line}`,
          borderBottom: `1px solid ${INK.line}`,
          padding: "16px 0",
        }}
      >
        {[
          ["Active projects", "24", "+6 this week"],
          ["Documents", "128", "+18 this week"],
          ["Completion", "92%", "+12 points"],
        ].map(([label, value, note]) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: INK.muted }}>{label}</div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 600,
                letterSpacing: -2,
                margin: "6px 0",
              }}
            >
              {value}
            </div>
            <div style={{ color: "#059669", fontSize: 14 }}>{note}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          margin: "22px 0 8px",
          fontSize: 17,
        }}
      >
        <strong>Activity</strong>
        <span style={{ color: INK.muted, fontSize: 14 }}>Last 7 days</span>
      </div>
      <svg
        width="100%"
        height="140"
        viewBox="0 0 820 176"
        preserveAspectRatio="none"
        role="img"
        aria-label="Activity rises through the week"
      >
        {[24, 76, 128].map((y) => (
          <line key={y} x1="0" x2="820" y1={y} y2={y} stroke="#edf0f5" />
        ))}
        <path
          d="M0 143 L135 119 L270 129 L405 83 L540 94 L675 39 L820 12 L820 160 L0 160Z"
          fill="#eef2ff"
        />
        <path
          d="M0 143 L135 119 L270 129 L405 83 L540 94 L675 39 L820 12"
          fill="none"
          stroke="#4f46e5"
          strokeWidth="4"
        />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: MONO,
          fontSize: 12,
          color: INK.muted,
        }}
      >
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
    </>
  );
}
