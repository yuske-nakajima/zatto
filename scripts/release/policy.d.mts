/** Release metadata bound to a checked-out package. */
export interface ReleaseState {
  tag: string;
  sha: string;
  headSha: string;
  targetSha: string;
  packageName: string;
  version: string;
  manifestVersion: string;
  releaseTag: string;
  prerelease: boolean;
  releaseBody: string;
  notes: string;
}
/** Parse a stable release tag. */
export function versionFromTag(tag: string): string;
/** Reject inconsistent release metadata. */
export function validateRelease(state: ReleaseState): void;
/** Select publication or idempotent resume; reject registry errors and conflicts. */
export function publicationAction(
  status: number,
  metadata: unknown,
  version: string,
  integrity: string,
): "publish" | "skip";
/** Validate an open, same-repository release PR and return its head. */
export function releasePullRequest(
  pr: unknown,
  repository: string,
): { branch: string; sha: string };
