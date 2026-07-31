import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { spawnDetachedServer } from "../src/cli/index.js";

type PackageManifest = {
  private?: boolean;
  files?: string[];
  bin?: Record<string, string>;
  license?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  publishConfig?: {
    registry?: string;
  };
};

const repositoryRoot = path.resolve(import.meta.dirname, "..");

describe("npmパッケージ", () => {
  test("公開メタデータと公開ファイルを定義する", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as PackageManifest;

    expect(manifest.private).not.toBe(true);
    expect(manifest.files).toEqual(["bin", "dist"]);
    expect(manifest.bin).toEqual({ zatto: "./bin/zatto.js" });
    expect(manifest.license).toBe("MIT");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/yuske-nakajima/zatto.git",
    });
    expect(manifest.publishConfig?.registry).toBe(
      "https://registry.npmjs.org/",
    );
  });

  test("CLIエントリはビルド成果物を実行する", async () => {
    const binSource = await readFile(
      path.join(repositoryRoot, "bin", "zatto.js"),
      "utf8",
    );

    expect(binSource).toContain('import("../dist/cli/index.js")');
    expect(binSource).not.toContain("tsx");
    expect(binSource).not.toContain("../src/");
  });

  test("常駐サーバーはビルド成果物をNode.jsで実行する", () => {
    const spawn = vi.fn<
      (
        executable: string,
        args: string[],
        options: { detached: true; stdio: "ignore" },
      ) => { unref(): void }
    >(() => ({ unref() {} }));

    spawnDetachedServer(6280, spawn);

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/server[/\\]index\.js$/), "--port", "6280"],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    expect(spawn.mock.calls[0]?.[1]).not.toContain("tsx/esm");
  });
});
