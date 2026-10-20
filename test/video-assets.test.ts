import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { TOUR_SPECS, VIDEO_SPECS } from "../video/spec.js";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("zatto promotion videos", () => {
  test.each([
    ["en", "ZattoPv"],
    ["ja", "ZattoPvJa"],
  ] as const)(
    "registers the %s promotion as twenty-five seconds in full HD",
    (locale, id) => {
      expect(VIDEO_SPECS[locale]).toEqual({
        id,
        width: 1920,
        height: 1080,
        fps: 30,
        durationInFrames: 750,
      });
    },
  );

  test.each([
    ["en", "ZattoPvTour"],
    ["ja", "ZattoPvTourJa"],
  ] as const)(
    "registers the %s feature tour as forty seconds in full HD",
    (locale, id) => {
      expect(TOUR_SPECS[locale]).toEqual({
        id,
        width: 1920,
        height: 1080,
        fps: 30,
        durationInFrames: 1200,
      });
    },
  );

  test("renders both feature tours from one command", () => {
    const script = packageJson.scripts["video:render:tour"];
    expect(script).toContain("ZattoPvTour media/zatto-pv-tour.mp4");
    expect(script).toContain("ZattoPvTourJa media/zatto-pv-tour-ja.mp4");
    expect(script).toContain("--codec=h264");
    expect(script).toContain("--muted");
  });

  test("renders both official MP4s from the default command", () => {
    expect(packageJson.scripts["video:studio"]).toBe(
      "remotion studio video/index.ts",
    );
    expect(packageJson.scripts["video:render"]).toBe(
      "pnpm run video:render:en && pnpm run video:render:ja",
    );
    for (const [locale, target] of [
      ["en", "ZattoPv media/zatto-pv.mp4"],
      ["ja", "ZattoPvJa media/zatto-pv-ja.mp4"],
    ]) {
      expect(packageJson.scripts[`video:render:${locale}`]).toContain(target);
      expect(packageJson.scripts[`video:render:${locale}`]).toContain(
        "--codec=h264",
      );
      expect(packageJson.scripts[`video:render:${locale}`]).toContain(
        "--muted",
      );
    }
    for (const retired of [
      "video:render:v2",
      "video:render:gif",
      "video:render:mp4",
    ]) {
      expect(packageJson.scripts[retired]).toBeUndefined();
    }
  });

  test("pins compatible Remotion packages", () => {
    expect(packageJson.devDependencies.remotion).toBe("4.0.534");
    expect(packageJson.devDependencies["@remotion/cli"]).toBe("4.0.534");
  });

  test.each([
    ["README.md", "zatto-pv", "zatto-pv-tour"],
    ["README.ja.md", "zatto-pv-ja", "zatto-pv-tour-ja"],
  ])("%s links its language-specific GIF to the MP4", (path, name, tour) => {
    const readme = readFileSync(path, "utf8");
    expect(readme).toContain(`href="./media/${tour}.mp4"`);
    expect(readme).toContain(`src="./media/${name}.gif"`);
    expect(readme).toContain(`media/${name}.mp4`);
    expect(readme).toContain("pnpm video:render");
    expect(readme).not.toContain("zatto-demo");
  });
});
