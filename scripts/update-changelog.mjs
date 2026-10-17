import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderChangelog } from "./changelog/render.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.argv.length > 2)
  throw new Error("Usage: node scripts/update-changelog.mjs");
const [snapshot, markdown, packageJson] = await Promise.all([
  readFile(path.join(root, "scripts/changelog/releases.json"), "utf8").then(
    JSON.parse,
  ),
  readFile(path.join(root, "CHANGELOG.md"), "utf8"),
  readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
]);
for (const locale of ["en", "ja"])
  await writeFile(
    path.join(root, `src/web/public/docs/${locale}/changelog.html`),
    renderChangelog(snapshot, markdown, packageJson.version, locale),
  );
console.log(`Generated offline changelogs through v${packageJson.version}.`);
