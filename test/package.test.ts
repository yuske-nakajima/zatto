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
const bundledDocumentationPaths = [
  "dist/web/docs/en/getting-started.html",
  "dist/web/docs/en/cli.html",
  "dist/web/docs/en/api.html",
  "dist/web/docs/en/gui-api-mapping.html",
  "dist/web/docs/ja/getting-started.html",
  "dist/web/docs/ja/cli.html",
  "dist/web/docs/ja/api.html",
  "dist/web/docs/ja/gui-api-mapping.html",
];

describe("npmパッケージ", () => {
  test("公開メタデータと公開ファイルを定義する", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as PackageManifest;

    expect(manifest.name).toBe("@yuske-nakajima/zatto");
    expect(manifest.version).toBe("0.6.0");
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
    expect(englishReadme).toContain(
      "add individual `.html` or `.htm` files with **+ Add**",
    );
    expect(englishReadme).toContain("separate **Add folder…** button");
    expect(englishReadme).toContain("selected folder only");
    expect(englishReadme).toContain("selected folder and its subfolders");
    expect(englishReadme).toContain("Symbolic links are ignored");
    expect(englishReadme).toContain("/api/session/pick-directory");
    expect(englishReadme).toContain('\'{"mode":"direct"}\'');
    expect(englishReadme).toContain('\'{"mode":"recursive"}\'');
    expect(japaneseReadme).toContain("ファイルを追加する場合は、**+ Add**");
    expect(japaneseReadme).toContain("独立した**Add folder…**ボタン");
    expect(japaneseReadme).toContain("選択したフォルダー直下のみ");
    expect(japaneseReadme).toContain("子孫フォルダーを含む");
    expect(japaneseReadme).toContain("シンボリックリンクは対象外です");
    expect(japaneseReadme).toContain("/api/session/pick-directory");
    expect(japaneseReadme).toContain('\'{"mode":"direct"}\'');
    expect(japaneseReadme).toContain('\'{"mode":"recursive"}\'');
    for (const readme of [englishReadme, japaneseReadme]) {
      expect(readme).toContain("npx @yuske-nakajima/zatto file.html");
      expect(readme).toContain("@yuske-nakajima/zatto/server");
      expect(readme).not.toMatch(/npx zatto(?:\s|$)/);
    }
    expect(englishReadme).toContain("## Built-in documentation");
    expect(englishReadme).toContain("**Docs** on the left side of the footer");
    expect(englishReadme).toContain(
      "Getting started, CLI, API, and GUI/API mapping",
    );
    expect(englishReadme).toContain("English is selected by default");
    expect(englishReadme).toContain("`doc` and `lang` URL parameters");
    expect(japaneseReadme).toContain("## 組み込みドキュメント");
    expect(japaneseReadme).toContain("フッター左側の**Docs**");
    expect(japaneseReadme).toContain(
      "Getting started、CLI、API、GUI/API mapping",
    );
    expect(japaneseReadme).toContain("既定の表示言語は英語です");
    expect(japaneseReadme).toContain("URLの`doc`と`lang`");
  });

  test("公開パッケージの組み込みドキュメントを検証する", async () => {
    const verifierSource = await readFile(
      path.join(repositoryRoot, "scripts", "verify-package.mjs"),
      "utf8",
    );

    expect(verifierSource).toContain('["en", "ja"]');
    for (const documentationPath of bundledDocumentationPaths.slice(0, 4)) {
      const page = path.basename(documentationPath, ".html");
      expect(verifierSource).toContain(`"${page}"`);
    }
    expect(verifierSource).toContain("...documentationPaths.map(");
    expect(verifierSource).toContain("`dist/web");
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
