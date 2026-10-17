const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const shaPattern = /^[a-f0-9]{40}$/;

/**
 * Require a stable version tag before constructing Git refs or API paths.
 * @param {string} tag Release tag.
 * @returns {string} Stable package version.
 * @throws {Error} When the tag is not a stable version.
 */
export function versionFromTag(tag) {
  if (
    typeof tag !== "string" ||
    !tag.startsWith("v") ||
    !versionPattern.test(tag.slice(1))
  ) {
    throw new Error("Release tag must be vMAJOR.MINOR.PATCH");
  }
  return tag.slice(1);
}

/**
 * Bind release metadata to the checked-out package and reviewed notes.
 * @param {object} state Release and checkout metadata.
 * @returns {void}
 * @throws {Error} When publication would use a different version, commit, or notes.
 */
export function validateRelease(state) {
  const version = versionFromTag(state.tag);
  if (
    !shaPattern.test(state.sha) ||
    state.sha !== state.headSha ||
    state.sha !== state.targetSha
  ) {
    throw new Error("Release tag, target commit, and checkout must match");
  }
  if (
    state.packageName !== "@yuske-nakajima/zatto" ||
    state.version !== version ||
    state.manifestVersion !== version
  ) {
    throw new Error("Release tag, package, and release manifest must match");
  }
  if (
    state.releaseTag !== state.tag ||
    state.prerelease ||
    typeof state.notes !== "string" ||
    !state.notes.trim() ||
    state.releaseBody?.trim() !== state.notes.trim()
  ) {
    throw new Error("GitHub Release must match the approved CHANGELOG entry");
  }
}

/**
 * Decide whether a verified artifact can be published or has already been published.
 * @param {number} status npm registry HTTP status.
 * @param {unknown} metadata npm version metadata.
 * @param {string} version Verified package version.
 * @param {string} integrity Verified tarball SHA-512 integrity.
 * @returns {"publish" | "skip"} Safe publication action.
 * @throws {Error} On registry errors or an existing different artifact.
 */
export function publicationAction(status, metadata, version, integrity) {
  if (status === 404) return "publish";
  if (status !== 200) throw new Error(`npm registry returned HTTP ${status}`);
  if (
    metadata?.name !== "@yuske-nakajima/zatto" ||
    metadata.version !== version ||
    metadata.dist?.integrity !== integrity
  ) {
    throw new Error(
      "Published npm version conflicts with the verified artifact",
    );
  }
  return "skip";
}

/**
 * Resolve the immutable head of an open release PR for explicit CI dispatch.
 * @param {object} pr GitHub REST pull request.
 * @param {string} repository Expected owner/repository.
 * @returns {{branch: string, sha: string}} Branch and exact commit to validate.
 * @throws {Error} When the PR is not an open same-repository release PR.
 */
export function releasePullRequest(pr, repository) {
  if (
    pr.state !== "open" ||
    pr.base?.ref !== "main" ||
    pr.head?.repo?.full_name !== repository ||
    !shaPattern.test(pr.head?.sha ?? "") ||
    !pr.head?.ref?.startsWith("release-please--") ||
    !pr.labels?.some((label) => label.name === "autorelease: pending")
  ) {
    throw new Error(
      "CI dispatch requires an open release PR in this repository",
    );
  }
  return { branch: pr.head.ref, sha: pr.head.sha };
}
