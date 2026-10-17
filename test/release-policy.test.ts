import { describe, expect, test } from "vitest";
import {
  publicationAction,
  releasePullRequest,
  validateRelease,
} from "../scripts/release/policy.mjs";

const sha = "a".repeat(40);
const release = {
  tag: "v2.0.0",
  sha,
  headSha: sha,
  targetSha: sha,
  packageName: "@yuske-nakajima/zatto",
  version: "2.0.0",
  manifestVersion: "2.0.0",
  releaseTag: "v2.0.0",
  prerelease: false,
  releaseBody: "### Features\n\n* RPC",
  notes: "### Features\n\n* RPC",
};

describe("release publication guards", () => {
  test("accepts a matching tagged release and its reviewed notes", () => {
    expect(() => validateRelease(release)).not.toThrow();
  });
  test.each([
    { tag: "main" },
    { version: "1.2.0" },
    { manifestVersion: "1.2.0" },
    { headSha: "b".repeat(40) },
    { targetSha: "main" },
    { releaseTag: "v2.1.0" },
    { prerelease: true },
    { packageName: "another-package" },
    { releaseBody: "different notes" },
  ])("rejects mismatched release provenance: %j", (change) => {
    expect(() => validateRelease({ ...release, ...change })).toThrow();
  });
  test("publishes an absent version and resumes an identical publication", () => {
    expect(publicationAction(404, null, "2.0.0", "sha512-abc")).toBe("publish");
    expect(
      publicationAction(
        200,
        {
          name: "@yuske-nakajima/zatto",
          version: "2.0.0",
          dist: { integrity: "sha512-abc" },
        },
        "2.0.0",
        "sha512-abc",
      ),
    ).toBe("skip");
  });
  test.each([
    [500, null],
    [403, null],
    [200, null],
    [
      200,
      {
        name: "@yuske-nakajima/zatto",
        version: "2.0.0",
        dist: { integrity: "sha512-other" },
      },
    ],
    [
      200,
      {
        name: "@yuske-nakajima/zatto",
        version: "2.1.0",
        dist: { integrity: "sha512-abc" },
      },
    ],
  ])(
    "refuses unavailable registry or conflicting published artifact",
    (status, data) => {
      expect(() =>
        publicationAction(Number(status), data, "2.0.0", "sha512-abc"),
      ).toThrow();
    },
  );
  test("dispatches CI only for a release PR in the same repository", () => {
    const pr = {
      number: 42,
      state: "open",
      base: { ref: "main" },
      head: {
        ref: "release-please--branches--main",
        sha,
        repo: { full_name: "owner/repo" },
      },
      labels: [{ name: "autorelease: pending" }],
    };
    expect(releasePullRequest(pr, "owner/repo")).toEqual({
      branch: pr.head.ref,
      sha,
    });
    expect(() =>
      releasePullRequest({ ...pr, state: "closed" }, "owner/repo"),
    ).toThrow();
    expect(() => releasePullRequest(pr, "fork/repo")).toThrow();
    expect(() =>
      releasePullRequest({ ...pr, labels: [] }, "owner/repo"),
    ).toThrow();
  });
});
