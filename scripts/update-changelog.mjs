import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderChangelog } from "./changelog/render.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const snapshotPath = path.join(root, "scripts/changelog/releases.json");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--refresh"))
  throw new Error("Usage: node scripts/update-changelog.mjs [--refresh]");
let snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
if (args.includes("--refresh")) {
  const repository = "yuske-nakajima/zatto";
  const fetchReleases = (media) =>
    JSON.parse(
      execFileSync(
        "gh",
        [
          "api",
          `repos/${repository}/releases?per_page=100`,
          "--paginate",
          "--slurp",
          "-H",
          `Accept: application/vnd.github.${media}+json`,
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      ),
    ).flat();
  const raw = fetchReleases("raw");
  const html = fetchReleases("html");
  const releases = html
    .filter((release) => !release.draft)
    .map((release) => {
      const source = raw.find((item) => item.id === release.id);
      if (
        !source ||
        typeof release.body_html !== "string" ||
        typeof release.published_at !== "string"
      )
        throw new Error("Release snapshot is incomplete; retry the refresh.");
      return {
        tag: release.tag_name,
        name: release.name || release.tag_name,
        publishedAt: release.published_at,
        url: release.html_url,
        body: source.body || "",
        bodyHtml: release.body_html,
      };
    })
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) ||
        b.tag.localeCompare(a.tag),
    );
  snapshot = { repository, releases };
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}
const pending = JSON.parse(
  await readFile(path.join(root, "scripts/changelog/pending.json"), "utf8"),
);
for (const locale of ["en", "ja"])
  await writeFile(
    path.join(root, `src/web/public/docs/${locale}/changelog.html`),
    renderChangelog(snapshot, pending, locale),
  );
console.log(
  `Generated English and Japanese changelogs from ${snapshot.releases.length} releases.`,
);
