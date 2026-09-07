import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY } from "../theme";
import { BrandLogo } from "./BrandLogo";

export function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
  const opacity = interpolate(frame, [58, 82], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
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
        opacity,
        transform: `translateY(${(1 - enter) * 24}px)`,
      }}
    >
      <BrandLogo width={230} />
      <div
        style={{
          marginTop: 22,
          color: COLORS.ink,
          fontSize: 47,
          fontWeight: 750,
        }}
      >
        Your local HTML, in one place.
      </div>
      <div
        style={{
          marginTop: 36,
          padding: "18px 26px",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 13,
          background: COLORS.ink,
          color: "#f8fafc",
          fontFamily: '"SFMono-Regular", Consolas, monospace',
          fontSize: 21,
          boxShadow: "0 18px 55px rgba(15, 23, 42, 0.16)",
        }}
      >
        <span style={{ color: "#818cf8" }}>$</span> npx @yuske-nakajima/zatto
        page.html report.html
      </div>
      <div style={{ marginTop: 18, color: COLORS.muted, fontSize: 19 }}>
        No install. No upload.
      </div>
    </div>
  );
}
