import { execFileSync } from "node:child_process";
import { versionFromTag } from "./policy.mjs";

/**
 * Read GitHub JSON using the workflow token supplied to gh.
 * @param {string} endpoint GitHub REST endpoint.
 * @returns {object} API response.
 * @throws {Error} If GitHub rejects or fails the request.
 */
export function github(endpoint) {
  return JSON.parse(
    execFileSync("gh", ["api", endpoint], { encoding: "utf8" }),
  );
}

/**
 * Resolve an existing GitHub Release and its tag to a commit.
 * @param {string} repository GitHub owner/repository.
 * @param {string} tag Stable version tag.
 * @returns {{release: object, sha: string}} Release metadata and dereferenced commit.
 * @throws {Error} If the release/tag is missing or the ref is invalid.
 */
export function releaseState(repository, tag) {
  versionFromTag(tag);
  const { databaseId } = JSON.parse(
    execFileSync(
      "gh",
      ["release", "view", tag, "--repo", repository, "--json", "databaseId"],
      { encoding: "utf8" },
    ),
  );
  if (!Number.isSafeInteger(databaseId) || databaseId < 1)
    throw new Error("GitHub Release ID is invalid");
  const release = github(`repos/${repository}/releases/${databaseId}`);
  if (release.tag_name !== tag)
    throw new Error("GitHub Release tag does not match");
  let ref = github(`repos/${repository}/git/ref/tags/${tag}`).object;
  for (let depth = 0; ref.type === "tag" && depth < 5; depth++) {
    ref = github(`repos/${repository}/git/tags/${ref.sha}`).object;
  }
  if (ref.type !== "commit" || !/^[a-f0-9]{40}$/.test(ref.sha)) {
    throw new Error("Release tag does not resolve to a commit");
  }
  return { release, sha: ref.sha };
}

/**
 * Update release fields without changing its tag or target commit.
 * @param {string} repository GitHub owner/repository.
 * @param {object} release Validated GitHub Release metadata.
 * @param {string} sha Validated target commit.
 * @param {object} changes Fields to update on the release.
 * @returns {{release: object, sha: string}} Re-read and verified release state.
 * @throws {Error} If the update response or stored release changes identity or content.
 */
export function updateRelease(repository, release, sha, changes) {
  // GitHub removes a draft release tag when tag_name is omitted from an update.
  const expected = {
    ...release,
    ...changes,
    tag_name: release.tag_name,
    target_commitish: sha,
  };
  const response = JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        "--method",
        "PATCH",
        `repos/${repository}/releases/${release.id}`,
        "--input",
        "-",
      ],
      {
        input: JSON.stringify({
          ...changes,
          tag_name: release.tag_name,
        }),
        encoding: "utf8",
      },
    ),
  );
  assertReleaseUpdate(response, expected);
  const stored = releaseState(repository, release.tag_name);
  if (stored.sha !== sha) throw new Error("Release tag changed during update");
  assertReleaseUpdate(stored.release, expected);
  return stored;
}

function assertReleaseUpdate(actual, expected) {
  for (const field of [
    "id",
    "tag_name",
    "target_commitish",
    "draft",
    "prerelease",
    "body",
  ]) {
    if (actual[field] !== expected[field])
      throw new Error(`GitHub Release update changed ${field}`);
  }
}
