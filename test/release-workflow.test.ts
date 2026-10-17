import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const directories: string[] = [];
const notes = "### Features\n\n* Reviewed **RPC** change";

async function fixture(
  options: {
    published?: boolean;
    conflict?: boolean;
    npmFails?: boolean;
    staleNotes?: boolean;
    prerelease?: boolean;
    latestVersion?: string;
    registryStatus?: number;
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
  const log = path.join(directory, "calls.log");
  await writeFile(log, "");
  const gh = path.join(directory, "gh");
  await writeFile(
    gh,
    `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nconst file = ${JSON.stringify(releaseFile)};\nconst release = JSON.parse(fs.readFileSync(file, 'utf8'));\nif(args[0] === 'release' && args[1] === 'view') { console.log(JSON.stringify({ databaseId: release.id })); }\nelse if (args.includes('PATCH')) {\n  const body = args.includes('--input') ? JSON.parse(fs.readFileSync(0, 'utf8')) : { draft: false };\n  Object.assign(release, body); fs.writeFileSync(file, JSON.stringify(release));\n  fs.appendFileSync(${JSON.stringify(log)}, body.body ? 'notes\\n' : 'github-publish\\n');\n  console.log(JSON.stringify(release));\n} else if (args[1].includes('/git/ref/')) console.log(JSON.stringify({object:{type:'commit',sha:${JSON.stringify(sha)}}}));\nelse if(args[1].endsWith('/releases/7')) console.log(JSON.stringify(release));\nelse { console.error('Unsupported or draft-inaccessible REST endpoint'); process.exit(1); }\n`,
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
      [path.join(repositoryRoot, "scripts/release", script)],
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
  return { run, log, releaseFile };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("release workflow external boundaries", () => {
  test("copies approved notes to a draft, then publishes npm before GitHub", async () => {
    const { run, log, releaseFile } = await fixture({ staleNotes: true });
    run("validate.mjs");
    run("publish.mjs");
    expect(await readFile(log, "utf8")).toBe(
      "notes\nnpm-publish\ngithub-publish\n",
    );
    expect(JSON.parse(await readFile(releaseFile, "utf8"))).toMatchObject({
      body: notes,
      draft: false,
    });
  });
  test("resumes an identical npm artifact without republishing", async () => {
    const { run, log } = await fixture({ published: true });
    run("publish.mjs");
    expect(await readFile(log, "utf8")).toBe("github-publish\n");
  });
  test.each([
    { published: true, conflict: true },
    { prerelease: true },
    { latestVersion: "2.1.0" },
    { registryStatus: 503 },
  ])(
    "stops conflicting or prerelease publication before writes: %j",
    async (options) => {
      const { run, log } = await fixture(options);
      expect(() => run("publish.mjs")).toThrow();
      expect(await readFile(log, "utf8")).toBe("");
    },
  );
  test("keeps the GitHub release draft when npm publish fails", async () => {
    const { run, log, releaseFile } = await fixture({ npmFails: true });
    expect(() => run("publish.mjs")).toThrow();
    expect(await readFile(log, "utf8")).toBe("npm-publish\n");
    expect(JSON.parse(await readFile(releaseFile, "utf8"))).toHaveProperty(
      "draft",
      true,
    );
  });
});
