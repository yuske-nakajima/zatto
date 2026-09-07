import { Easing, interpolate } from "remotion";

/** Typography shared by all filmed screens. */
export const FONT =
  '"Helvetica Neue", "Hiragino Sans", "Yu Gothic", Arial, sans-serif';
/** Monospace typography for commands, paths and source matches. */
export const MONO = '"SF Mono", Menlo, Consolas, monospace';
/** The app's light palette and the neutral film background. */
export const INK = {
  text: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  accent: "#4f46e5",
  selected: "#eef2ff",
  paper: "#ffffff",
  stage: "#eeeff2",
};

/**
 * Interpolates a clamped camera or opacity transition.
 * @param frame - Global frame.
 * @param start - First frame.
 * @param end - Last frame.
 * @param from - Initial value.
 * @param to - Final value.
 * @returns A value using cubic ease in/out.
 */
export function move(
  frame: number,
  start: number,
  end: number,
  from = 0,
  to = 1,
): number {
  return interpolate(frame, [start, end], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
}
