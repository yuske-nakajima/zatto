import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(
        readFileSync(new URL("./package.json", import.meta.url), "utf8"),
      ).version,
    ),
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
