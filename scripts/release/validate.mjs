import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { extractReleaseNotes } from "../changelog/entries.mjs";
import { releaseState, updateRelease } from "./github.mjs";
import { validateRelease } from "./policy.mjs";

/**
 * Revalidate remote release provenance against the immutable checkout.
 * @param {boolean} updateDraftNotes Synchronize draft notes from the approved file.
 * @returns {{release: object, sha: string, version: string}} Validated release state.
 * @throws {Error} If provenance, ancestry, version, or notes differ.
 */
export function validateCheckout(updateDraftNotes = false) {
  const tag = process.env.RELEASE_TAG;
  const { release, sha } = releaseState(process.env.GITHUB_REPOSITORY, tag);
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const versions = JSON.parse(
    readFileSync(".release-please-manifest.json", "utf8"),
  );
  const notes = extractReleaseNotes(
    readFileSync("CHANGELOG.md", "utf8"),
    manifest.version,
  );
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const state = {
    tag,
    sha,
    headSha,
    targetSha: release.target_commitish,
    packageName: manifest.name,
    version: manifest.version,
    manifestVersion: versions["."],
    releaseTag: release.tag_name,
    prerelease: release.prerelease,
    releaseBody: release.body,
    notes,
  };
  const synchronize = updateDraftNotes && release.draft;
  validateRelease({
    ...state,
    releaseBody: synchronize ? notes : release.body,
  });
  execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"]);
  if (synchronize && release.body?.trim() !== notes) {
    const updated = updateRelease(process.env.GITHUB_REPOSITORY, release, sha, {
      body: notes,
    });
    return { ...updated, version: manifest.version };
  }
  return { release, sha, version: manifest.version };
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  validateCheckout(true);
}
