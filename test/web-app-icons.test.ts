import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

interface WebAppManifest {
  name: string;
  short_name: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose: string;
  }>;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const webRoot = join(repositoryRoot, "src/web");
const assetsRoot = join(webRoot, "assets");
const buildOutput = mkdtempSync(join(tmpdir(), "zatto-web-icons-"));
const DESKTOP_ICO_SHA256 =
  "56f9732035275e5829d99d293862670cb399ce467b7d80b5c1ae4e3073944d71";
const DESKTOP_PNG_SHA256 =
  "3d642d2b7a84651741f864266fdff5821a7203ef27178d4824fd77337a466f28";

beforeAll(async () => {
  await build({
    configFile: join(repositoryRoot, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir: buildOutput, emptyOutDir: true },
  });
});

afterAll(() => {
  rmSync(buildOutput, { recursive: true, force: true });
});

describe("Webアプリアイコン", () => {
  test("HTMLがブラウザーとインストール用の各アイコンを参照する", () => {
    const html = readFileSync(join(webRoot, "index.html"), "utf8");

    expect(html).toContain('href="./assets/zatto-favicon.ico"');
    expect(html).toContain('href="./assets/zatto-favicon.png"');
    expect(html).toContain('href="./assets/zatto-icon-192.png"');
    expect(html).toContain('href="./assets/zatto-apple-touch-icon.png"');
    expect(html).toContain('href="./manifest.webmanifest"');
  });

  test("Manifestがstandaloneアプリと2種類のアイコンを定義する", () => {
    const manifest = readManifest(join(webRoot, "manifest.webmanifest"));

    expect(manifest).toEqual({
      name: "zatto",
      short_name: "zatto",
      id: "./",
      start_url: "./",
      scope: "./",
      display: "standalone",
      theme_color: "#181818",
      background_color: "#181818",
      icons: [
        {
          src: "./assets/zatto-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "./assets/zatto-favicon.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
      ],
    });
  });

  test("指定元と同じfaviconと用途別PNG寸法を配置する", () => {
    expect(sha256(join(assetsRoot, "zatto-favicon.ico"))).toBe(
      DESKTOP_ICO_SHA256,
    );
    expect(sha256(join(assetsRoot, "zatto-favicon.png"))).toBe(
      DESKTOP_PNG_SHA256,
    );
    expect(readPngSize(join(assetsRoot, "zatto-favicon.png"))).toEqual({
      width: 512,
      height: 512,
    });
    expect(readPngSize(join(assetsRoot, "zatto-icon-192.png"))).toEqual({
      width: 192,
      height: 192,
    });
    expect(readPngSize(join(assetsRoot, "zatto-apple-touch-icon.png"))).toEqual(
      { width: 180, height: 180 },
    );
  });

  test("production buildへManifestとすべてのアイコンを出力する", () => {
    const html = readFileSync(join(buildOutput, "index.html"), "utf8");
    const expectedPaths = [
      "manifest.webmanifest",
      "assets/zatto-favicon.ico",
      "assets/zatto-favicon.png",
      "assets/zatto-icon-192.png",
      "assets/zatto-apple-touch-icon.png",
    ];

    for (const relativePath of expectedPaths) {
      expect(statSync(join(buildOutput, relativePath)).isFile()).toBe(true);
      expect(html).toContain(`href="/${relativePath}"`);
    }
    expect(sha256(join(buildOutput, "assets/zatto-favicon.ico"))).toBe(
      DESKTOP_ICO_SHA256,
    );
    expect(sha256(join(buildOutput, "assets/zatto-favicon.png"))).toBe(
      DESKTOP_PNG_SHA256,
    );
    expect(readPngSize(join(buildOutput, "assets/zatto-icon-192.png"))).toEqual(
      { width: 192, height: 192 },
    );
    expect(
      readPngSize(join(buildOutput, "assets/zatto-apple-touch-icon.png")),
    ).toEqual({ width: 180, height: 180 });
    const manifest = readManifest(join(buildOutput, "manifest.webmanifest"));
    for (const icon of manifest.icons) {
      expect(statSync(resolve(buildOutput, icon.src)).isFile()).toBe(true);
    }
  });
});

function readManifest(path: string): WebAppManifest {
  return JSON.parse(readFileSync(path, "utf8")) as WebAppManifest;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readPngSize(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, signature.length).equals(signature)) {
    throw new Error(`${path} is not a PNG file`);
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
