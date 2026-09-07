import { eyebrow, heading } from "./document-style";
import { INK, MONO } from "./style";

/** Maps the local tools, server and filesystem.
 * @returns The HTML preview content.
 */
export function Diagram() {
  return (
    <>
      <div style={eyebrow}>ENGINEERING / SYSTEM MAP</div>
      <h2 style={heading}>System architecture</h2>
      <p style={{ color: INK.muted, fontSize: 18, margin: "0 0 18px" }}>
        One workspace. Connected tools.
      </p>
      <svg
        width="100%"
        height="290"
        viewBox="0 0 820 365"
        role="img"
        aria-label="CLI and browser connect to a local server and HTML files"
      >
        <g fill="none" stroke="#a5b4fc" strokeWidth="2">
          <path d="M190 90 H335 V178 H380" />
          <path d="M190 270 H335 V178" />
          <path d="M575 178 H643" />
        </g>
        <g fill="#f8fafc" stroke="#d9dfe8">
          <rect x="5" y="40" width="190" height="100" rx="8" />
          <rect x="5" y="220" width="190" height="100" rx="8" />
          <rect x="643" y="128" width="172" height="100" rx="8" />
        </g>
        <rect
          x="380"
          y="111"
          width="195"
          height="134"
          rx="8"
          fill="#eef2ff"
          stroke="#818cf8"
        />
        <g fontSize="23" fontWeight="550" fill="#172139" textAnchor="middle">
          <text x="100" y="85">
            CLI
          </text>
          <text x="100" y="265">
            Browser
          </text>
          <text x="477" y="173">
            Local server
          </text>
          <text x="729" y="173">
            HTML files
          </text>
        </g>
        <g fontSize="14" fill="#64748b" textAnchor="middle">
          <text x="100" y="111">
            commands
          </text>
          <text x="100" y="292">
            preview
          </text>
          <text x="477" y="201">
            localhost
          </text>
          <text x="729" y="200">
            filesystem
          </text>
        </g>
        <circle cx="335" cy="178" r="5" fill="#4f46e5" />
      </svg>
      <div
        style={{
          borderTop: `1px solid ${INK.line}`,
          paddingTop: 20,
          fontFamily: MONO,
          color: INK.muted,
          fontSize: 14,
        }}
      >
        01 — Local-first architecture
      </div>
    </>
  );
}
