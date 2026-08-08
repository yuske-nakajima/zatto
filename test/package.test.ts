import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { spawnDetachedServer } from "../src/cli/index.js";
import { APP_VERSION } from "../src/meta.js";

type PackageManifest = {
  version?: string;
  name?: string;
  private?: boolean;
  files?: string[];
  bin?: Record<string, string>;
  exports?: {
    "./server"?: { types?: string; import?: string; default?: string };
    "./package.json"?: string;
  };
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

    expect(manifest.name).toBe("@yuske-nakajima/zatto");
    expect(manifest.version).toBe("0.1.5");
    expect(APP_VERSION).toBe(manifest.version);
    expect(manifest.private).not.toBe(true);
    expect(manifest.files).toEqual(["bin", "dist", "README.ja.md"]);
    expect(manifest.bin).toEqual({ zatto: "bin/zatto.js" });
    expect(manifest.exports).toEqual({
      "./server": {
        types: "./dist/server/index.d.ts",
        import: "./dist/server/index.js",
        default: "./dist/server/index.js",
      },
      "./package.json": "./package.json",
    });
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

    spawnDetachedServer(6280, "instance-id", "/tmp/zatto-runtime.json", spawn);

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringMatching(/server[/\\]index\.js$/),
        "--port",
        "6280",
        "--instance-id",
        "instance-id",
        "--runtime-file",
        "/tmp/zatto-runtime.json",
      ],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    expect(spawn.mock.calls[0]?.[1]).not.toContain("tsx/esm");
  });

  test("英語と日本語のREADMEからロゴと言語切り替えを案内する", async () => {
    const [englishReadme, japaneseReadme] = await Promise.all([
      readFile(path.join(repositoryRoot, "README.md"), "utf8"),
      readFile(path.join(repositoryRoot, "README.ja.md"), "utf8"),
    ]);

    for (const readme of [englishReadme, japaneseReadme]) {
      expect(readme).toContain("src/web/assets/zatto-logo-black.png");
      expect(readme).toContain("src/web/assets/zatto-logo-white.png");
    }
    expect(englishReadme).toContain("[日本語](./README.ja.md)");
    expect(englishReadme).toContain("Browse local HTML files");
    expect(japaneseReadme).toContain("[English](./README.md)");
    expect(japaneseReadme).toContain(
      "ローカルのHTMLファイルをまとめて閲覧できます",
    );
    for (const readme of [englishReadme, japaneseReadme]) {
      expect(readme).toContain("npx @yuske-nakajima/zatto file.html");
      expect(readme).toContain("@yuske-nakajima/zatto/server");
      expect(readme).not.toMatch(/npx zatto(?:\s|$)/);
    }
  });

  test("GitHub ActionsからOIDCでnpmパッケージを公開する", async () => {
    const releaseWorkflow = await readFile(
      path.join(repositoryRoot, ".github", "workflows", "release.yml"),
      "utf8",
    );

    expect(releaseWorkflow).toContain("workflow_dispatch:");
    expect(releaseWorkflow).toContain("id-token: write");
    expect(releaseWorkflow).toContain("pnpm run verify:package");
    expect(releaseWorkflow).toContain("npm publish --access public");
    expect(releaseWorkflow).toContain("gh release create");
    expect(releaseWorkflow).not.toContain("NPM_TOKEN");
  });
});
