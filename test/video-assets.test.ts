import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { VIDEO_SPECS } from "../video/spec.js";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("zatto promotion videos", () => {
  test.each([
    ["en", "ZattoPv"],
    ["ja", "ZattoPvJa"],
  ] as const)(
    "registers the %s promotion as twenty seconds in full HD",
    (locale, id) => {
      expect(VIDEO_SPECS[locale]).toEqual({
        id,
        width: 1920,
        height: 1080,
        fps: 30,
        durationInFrames: 600,
      });
    },
  );

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
    expect(packageJson.devDependencies.remotion).toBe("4.0.522");
    expect(packageJson.devDependencies["@remotion/cli"]).toBe("4.0.522");
    expect(packageJson.devDependencies.zod).toBe("4.5.4");
  });

  test.each([
    ["README.md", "zatto-pv"],
    ["README.ja.md", "zatto-pv-ja"],
  ])("%s links its language-specific GIF to the MP4", (path, name) => {
    const readme = readFileSync(path, "utf8");
    expect(readme).toContain(`src="./media/${name}.gif"`);
    expect(readme).toContain(`media/${name}.mp4`);
    expect(readme).toContain("pnpm video:render");
    expect(readme).not.toContain("zatto-demo");
  });
});
