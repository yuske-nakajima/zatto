import { AbsoluteFill } from "remotion";
import { BrowserMockup } from "./components/BrowserMockup";
import { IntroScene } from "./components/IntroScene";
import { OutroScene } from "./components/OutroScene";
import { COLORS } from "./theme";

export function ZattoDemo() {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: `radial-gradient(circle at 50% 15%, ${COLORS.surface} 0%, ${COLORS.app} 54%, #eef2ff 125%)`,
      }}
    >
      <IntroScene />
      <BrowserMockup />
      <OutroScene />
    </AbsoluteFill>
  );
}
