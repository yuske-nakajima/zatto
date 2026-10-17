import { execFileSync } from "node:child_process";
import { github } from "./github.mjs";
import { releasePullRequest } from "./policy.mjs";

const repository = process.env.GITHUB_REPOSITORY;
const prs = JSON.parse(process.env.RELEASE_PRS ?? "[]");
for (const candidate of prs) {
  if (!Number.isSafeInteger(candidate.number) || candidate.number < 1)
    throw new Error("Invalid release PR number");
  const pr = github(`repos/${repository}/pulls/${candidate.number}`);
  const { branch, sha } = releasePullRequest(pr, repository);
  execFileSync(
    "gh",
    [
      "workflow",
      "run",
      "ci.yml",
      "--repo",
      repository,
      "--ref",
      branch,
      "-f",
      `expected_sha=${sha}`,
    ],
    { stdio: "inherit" },
  );
}
