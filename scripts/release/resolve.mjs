import { appendFileSync } from "node:fs";
import { releaseState } from "./github.mjs";

const tag = process.env.RELEASE_TAG;
const { sha } = releaseState(process.env.GITHUB_REPOSITORY, tag);
if (process.env.RELEASE_SHA && process.env.RELEASE_SHA !== sha) {
  throw new Error("Release tag differs from the release-please commit");
}
appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nsha=${sha}\n`);
