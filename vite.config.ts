import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const WEB_APP_ICON_NAMES = new Set([
  "zatto-apple-touch-icon.png",
  "zatto-favicon.ico",
  "zatto-favicon.png",
  "zatto-icon-192.png",
]);

// Markdown表示が読み込むテーマとMermaidを、通信なしで配信できるよう配布物へ複写する
const MARKDOWN_VENDOR_FILES = [
  [
    "github-markdown-css/github-markdown-light.css",
    "github-markdown-light.css",
  ],
  ["github-markdown-css/github-markdown-dark.css", "github-markdown-dark.css"],
  ["github-markdown-css/license", "github-markdown-css-LICENSE.txt"],
  ["mermaid/dist/mermaid.min.js", "mermaid.min.js"],
  ["mermaid/LICENSE", "mermaid-LICENSE.txt"],
] as const;

function markdownVendorAssets(): Plugin {
  return {
    name: "zatto-markdown-vendor-assets",
    apply: "build",
    closeBundle() {
      const target = fileURLToPath(
        new URL("./dist/web/assets/vendor/", import.meta.url),
      );
      mkdirSync(target, { recursive: true });
      for (const [source, name] of MARKDOWN_VENDOR_FILES)
        copyFileSync(
          fileURLToPath(new URL(`./node_modules/${source}`, import.meta.url)),
          `${target}${name}`,
        );
    },
  };
}

export default defineConfig({
  root: "src/web",
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(
        readFileSync(new URL("./package.json", import.meta.url), "utf8"),
      ).version,
    ),
  },
  plugins: [react(), markdownVendorAssets()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        assetFileNames(assetInfo) {
          const assetName = assetInfo.name ?? "";
          if (assetName === "manifest.webmanifest") {
            return "[name][extname]";
          }
          if (WEB_APP_ICON_NAMES.has(assetName)) {
            return "assets/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
