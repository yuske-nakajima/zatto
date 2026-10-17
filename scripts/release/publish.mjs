import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { compareVersions } from "../changelog/entries.mjs";
import { updateRelease } from "./github.mjs";
import { publicationAction } from "./policy.mjs";
import { validateCheckout } from "./validate.mjs";

const { version } = validateCheckout();
const tarball = process.env.ZATTO_RELEASE_TARBALL;
if (!tarball) throw new Error("A verified package tarball is required");
const integrity = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
const registry = "https://registry.npmjs.org/@yuske-nakajima%2fzatto";
const response = await fetch(`${registry}/${version}`, {
  signal: AbortSignal.timeout(30_000),
});
const action = publicationAction(
  response.status,
  response.ok ? await response.json() : null,
  version,
  integrity,
);
if (action === "publish") {
  const latest = await fetch(`${registry}/latest`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!latest.ok)
    throw new Error(`Cannot verify npm latest: HTTP ${latest.status}`);
  const latestVersion = (await latest.json()).version;
  if (compareVersions(version, latestVersion) <= 0)
    throw new Error("Refusing to move npm latest to an older version");
  execFileSync(
    "npm",
    ["publish", tarball, "--access", "public", "--ignore-scripts"],
    { stdio: "inherit" },
  );
} else {
  console.log(`npm ${version} already contains the verified artifact`);
}
const verified = validateCheckout();
updateRelease(process.env.GITHUB_REPOSITORY, verified.release, verified.sha, {
  draft: false,
  make_latest: "legacy",
});
