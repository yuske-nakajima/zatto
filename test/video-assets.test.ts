import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { VIDEO_SPEC } from "../video/spec.js";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("zatto demo video", () => {
  test("READMEとSNSへ共用できる16:9の無音コンポジションを定義する", () => {
    expect(VIDEO_SPEC).toEqual({
      id: "ZattoDemo",
      width: 1280,
      height: 720,
      fps: 30,
      durationInFrames: 360,
    });
  });

  test("同じコンポジションからGIFとMP4を再生成する", () => {
    expect(packageJson.scripts["video:studio"]).toBe(
      "remotion studio video/index.ts",
    );
    expect(packageJson.scripts["video:render:mp4"]).toContain(
      "ZattoDemo media/zatto-demo.mp4",
    );
    expect(packageJson.scripts["video:render:mp4"]).toContain("--muted");
    expect(packageJson.scripts["video:render:gif"]).toContain(
      "ZattoDemo media/zatto-demo.gif",
    );
    expect(packageJson.scripts["video:render"]).toBe(
      "pnpm run video:render:mp4 && pnpm run video:render:gif",
    );
  });

  test("Remotionパッケージを同じバージョンで固定する", () => {
    expect(packageJson.devDependencies.remotion).toBe("4.0.522");
    expect(packageJson.devDependencies["@remotion/cli"]).toBe("4.0.522");
    expect(packageJson.devDependencies.zod).toBe("4.5.4");
  });

  test.each(["README.md", "README.ja.md"])(
    "%sにデモGIFと再生成コマンドを掲載する",
    (path) => {
      const readme = readFileSync(path, "utf8");
      expect(readme).toContain("media/zatto-demo.gif");
      expect(readme).toContain("pnpm video:render");
    },
  );
});
