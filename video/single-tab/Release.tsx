import { eyebrow, heading } from "./document-style";
import { INK, MONO } from "./style";

/**
 * Presents the release checklist.
 * @param props - Whether to highlight the matched heading.
 * @returns The checklist document.
 */
export function Release({ highlight }: { highlight: boolean }) {
  return (
    <>
      <div style={eyebrow}>PROJECT / DELIVERY</div>
      <h2 style={heading}>
        <span style={{ background: highlight ? "#fef08a" : "transparent" }}>
          Release
        </span>{" "}
        checklist
      </h2>
      <p style={{ fontSize: 18, color: INK.muted }}>
        Ready for the next release.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "22px 0",
          borderBottom: `1px solid ${INK.line}`,
          color: "#059669",
          fontSize: 17,
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 9,
            background: "#10b981",
          }}
        />{" "}
        All checks passed
      </div>
      {[
        "Review the interface",
        "Verify CLI commands",
        "Test search and navigation",
        "Prepare the release notes",
      ].map((label, i) => (
        <div
          key={label}
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            borderBottom: `1px solid ${INK.line}`,
            padding: "24px 0",
            fontSize: 21,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              color: "#059669",
              background: "#ecfdf5",
              width: 26,
              height: 26,
              borderRadius: 5,
              fontSize: 18,
            }}
          >
            ✓
          </span>
          {label}
          <span
            style={{
              marginLeft: "auto",
              color: INK.muted,
              fontFamily: MONO,
              fontSize: 13,
            }}
          >
            0{i + 1}
          </span>
        </div>
      ))}
    </>
  );
}
