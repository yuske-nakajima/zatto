/** Supported promotion copy languages. */
export type FilmLocale = "en" | "ja";

const VIDEO_FORMAT = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 600,
};

/** Official promotions share their format and animation timeline. */
export const VIDEO_SPECS = {
  en: { ...VIDEO_FORMAT, id: "ZattoPv" },
  ja: { ...VIDEO_FORMAT, id: "ZattoPvJa" },
};
