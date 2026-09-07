export interface VideoSpec {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

export const VIDEO_SPEC: VideoSpec = {
  id: "ZattoDemo",
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 360,
};
