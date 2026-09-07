import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";
import { BrandLogo } from "./BrandLogo";

export function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - 292,
    fps,
    config: { damping: 17, stiffness: 100 },
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_FAMILY,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 22}px)`,
      }}
    >
      <BrandLogo width={190} />
      <div
        style={{
          marginTop: 25,
          color: COLORS.ink,
          fontSize: 48,
          fontWeight: 770,
        }}
      >
        Open. Switch. Review.
      </div>
      <div style={{ marginTop: 15, color: COLORS.muted, fontSize: 22 }}>
        One local session for every HTML file.
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
        {["Preview", "Search", "Docs"].map((label) => (
          <span
            key={label}
            style={{
              padding: "9px 15px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 18,
              background: COLORS.surface,
              color: COLORS.muted,
              fontSize: 14,
              fontWeight: 650,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
