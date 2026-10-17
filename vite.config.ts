import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const WEB_APP_ICON_NAMES = new Set([
  "zatto-apple-touch-icon.png",
  "zatto-favicon.ico",
  "zatto-favicon.png",
  "zatto-icon-192.png",
]);

export default defineConfig({
  root: "src/web",
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(
        readFileSync(new URL("./package.json", import.meta.url), "utf8"),
      ).version,
    ),
  },
  plugins: [react()],
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
