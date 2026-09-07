import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";
import { DemoPreview } from "./DemoPreview";
import { DemoSidebar } from "./DemoSidebar";

export function BrowserMockup() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - 55,
    fps,
    config: { damping: 18, stiffness: 95 },
  });
  const exit = interpolate(frame, [282, 310], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const selectedIndex = frame < 148 ? 0 : frame < 215 ? 1 : 2;
  const caption =
    frame < 145 ? "Open once." : "Switch every page in one session.";
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
        opacity: progress * exit,
        transform: `scale(${0.94 + progress * 0.06}) translateY(${(1 - progress) * 25}px)`,
      }}
    >
      <div
        style={{
          marginBottom: 20,
          color: COLORS.ink,
          fontSize: 29,
          fontWeight: 730,
        }}
      >
        {caption}
      </div>
      <div
        style={{
          width: 1120,
          height: 560,
          overflow: "hidden",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          background: COLORS.surface,
          boxShadow: "0 28px 80px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 42,
            padding: "0 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            background: COLORS.app,
          }}
        >
          <div style={{ display: "flex", gap: 7 }}>
            {["#ef4444", "#f59e0b", "#22c55e"].map((color) => (
              <span
                key={color}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 10,
                  background: color,
                }}
              />
            ))}
          </div>
          <div
            style={{
              margin: "0 auto",
              padding: "6px 110px",
              borderRadius: 7,
              background: COLORS.surface,
              color: COLORS.muted,
              fontSize: 12,
            }}
          >
            localhost:6280
          </div>
        </div>
        <div
          style={{
            display: "grid",
            height: 488,
            gridTemplateColumns: "275px 1fr",
          }}
        >
          <DemoSidebar selectedIndex={selectedIndex} />
          <DemoPreview index={selectedIndex} />
        </div>
      </div>
    </div>
  );
}
