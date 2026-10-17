import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stageReleaseToolingFixture } from "./release-tooling-fixture.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const directories: string[] = [];
/** Approved release body used by external-boundary fixtures. */
export const notes = "### Features\n\n* Reviewed **RPC** change";

/**
 * Build an isolated tagged app and independently staged release controller.
 * @param options External service responses and filesystem behavior.
 * @returns Fixture paths and an entry-point runner.
 * @throws If fixture setup or staging fails.
 */
export async function createReleaseFixture(
  options: {
    crossDevice?: boolean;
    published?: boolean;
    conflict?: boolean;
    npmFails?: boolean;
    staleNotes?: boolean;
    prerelease?: boolean;
    latestVersion?: string;
    registryStatus?: number;
    responseMutation?:
      | "tag_name"
      | "target_commitish"
      | "id"
      | "body"
      | "draft"
      | "prerelease";
    storedMutation?:
      | "tag_name"
      | "target_commitish"
      | "id"
      | "body"
      | "draft"
      | "prerelease";
  } = {},
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "zatto-release-test-"),
  );
  directories.push(directory);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "@yuske-nakajima/zatto", version: "2.0.0" }),
  );
  await writeFile(
    path.join(directory, ".release-please-manifest.json"),
    JSON.stringify({ ".": "2.0.0" }),
  );
  await writeFile(
    path.join(directory, "CHANGELOG.md"),
    `# Changelog\n\n## 2.0.0 (2026-10-17)\n\n${notes}\n`,
  );
  git("init", "--initial-branch=main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Release test");
  git("add", ".");
  git("commit", "-m", "chore(main): release 2.0.0");
  const sha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", sha);
  const tarball = path.join(directory, "package.tgz");
  await writeFile(tarball, "verified package bytes");
  const integrity = `sha512-${createHash("sha512").update("verified package bytes").digest("base64")}`;
  const releaseFile = path.join(directory, "release.json");
  await writeFile(
    releaseFile,
    JSON.stringify({
      id: 7,
      tag_name: "v2.0.0",
      draft: true,
      prerelease: options.prerelease ?? false,
      target_commitish: sha,
      body: options.staleNotes ? "PR body notes" : notes,
    }),
  );
  const controller = await mkdtemp(
    path.join(os.tmpdir(), "zatto-release-controller-"),
  );
  directories.push(controller);
  const staged = await stageReleaseToolingFixture(
    repositoryRoot,
    controller,
    options.crossDevice,
  );
  const log = path.join(directory, "calls.log");
  await writeFile(log, "");
  const gh = path.join(directory, "gh");
  await writeFile(
    gh,
    `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nconst file = ${JSON.stringify(releaseFile)};\nconst release = JSON.parse(fs.readFileSync(file, 'utf8'));\nif(args[0] === 'release' && args[1] === 'view') { if (args[2] !== release.tag_name) { console.error('release not found'); process.exit(1); } console.log(JSON.stringify({ databaseId: release.id })); }\nelse if (args.includes('PATCH')) {\n  const body = args.includes('--input') ? JSON.parse(fs.readFileSync(0, 'utf8')) : { draft: false };\n  if ('target_commitish' in body) { console.error('HTTP 403: Resource not accessible by integration'); process.exit(1); }\n  if (release.draft && !body.tag_name) release.tag_name = 'untagged-fixture';\n  Object.assign(release, body);\n  const reply = { ...release };\n  const corrupt = { tag_name: 'changed-tag', target_commitish: 'b'.repeat(40), id: 999, body: 'changed-body', draft: !release.draft, prerelease: !release.prerelease };\n  const responseField = ${JSON.stringify(options.responseMutation ?? "")};\n  const storedField = ${JSON.stringify(options.storedMutation ?? "")};\n  if(responseField) reply[responseField] = corrupt[responseField];\n  if(storedField) release[storedField] = corrupt[storedField];\n  fs.writeFileSync(file, JSON.stringify(release));\n  fs.appendFileSync(${JSON.stringify(log)}, body.body ? 'notes\\n' : 'github-publish\\n');\n  console.log(JSON.stringify(reply));\n} else if (args[1].includes('/git/ref/')) console.log(JSON.stringify({object:{type:'commit',sha:${JSON.stringify(sha)}}}));\nelse if(args[1].endsWith('/releases/7')) console.log(JSON.stringify(release));\nelse { console.error('Unsupported or draft-inaccessible REST endpoint'); process.exit(1); }\n`,
  );
  const npm = path.join(directory, "npm");
  await writeFile(
    npm,
    `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, 'npm-publish\\n');\nprocess.exit(${options.npmFails ? 1 : 0});\n`,
  );
  await chmod(gh, 0o755);
  await chmod(npm, 0o755);
  const fetchModule = path.join(directory, "fetch.mjs");
  await writeFile(
    fetchModule,
    `globalThis.fetch = async (url) => {\nif(url.endsWith('/latest'))return Response.json({version:${JSON.stringify(options.latestVersion ?? "1.2.0")}});\nreturn ${options.published ? `Response.json({name:'@yuske-nakajima/zatto',version:'2.0.0',dist:{integrity:${JSON.stringify(options.conflict ? "sha512-conflict" : integrity)}}})` : `new Response(null,{status:${options.registryStatus ?? 404}})`};\n};\n`,
  );
  const run = (script: string) =>
    execFileSync(
      process.execPath,
      [path.join(staged, "scripts/release", script)],
      {
        cwd: directory,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          NODE_OPTIONS: `--import=${fetchModule}`,
          RELEASE_TAG: "v2.0.0",
          GITHUB_REPOSITORY: "owner/repo",
          ZATTO_RELEASE_TARBALL: tarball,
        },
      },
    );
  return { run, log, releaseFile, directory, staged, sha };
}

/**
 * Remove temporary release application and controller fixtures.
 * @returns A promise that resolves after cleanup.
 * @throws If temporary files cannot be removed.
 */
export async function cleanupReleaseFixtures() {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
