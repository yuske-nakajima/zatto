import { Composition } from "remotion";
import { VIDEO_SPEC } from "./spec";
import { ZattoDemo } from "./ZattoDemo";

export function VideoRoot() {
  return (
    <Composition
      id={VIDEO_SPEC.id}
      component={ZattoDemo}
      durationInFrames={VIDEO_SPEC.durationInFrames}
      fps={VIDEO_SPEC.fps}
      width={VIDEO_SPEC.width}
      height={VIDEO_SPEC.height}
    />
  );
}
