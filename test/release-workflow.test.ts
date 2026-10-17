import { mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  cleanupReleaseFixtures,
  createReleaseFixture,
  notes,
} from "./release-workflow-fixture.js";

afterEach(cleanupReleaseFixtures);

describe("release workflow external boundaries", () => {
  test("updates existing release notes and publishes with Contents write permission", async () => {
    const { run, log, releaseFile, sha } = await createReleaseFixture({
      staleNotes: true,
    });
    run("validate.mjs");
    run("publish.mjs");
    expect(await readFile(log, "utf8")).toBe(
      "notes\nnpm-publish\ngithub-publish\n",
    );
    expect(JSON.parse(await readFile(releaseFile, "utf8"))).toMatchObject({
      body: notes,
      draft: false,
      tag_name: "v2.0.0",
      target_commitish: sha,
    });
  });
  test("resumes an identical npm artifact without republishing", async () => {
    const { run, log, releaseFile } = await createReleaseFixture({
      published: true,
    });
    run("publish.mjs");
    expect(await readFile(log, "utf8")).toBe("github-publish\n");
    expect(JSON.parse(await readFile(releaseFile, "utf8"))).toHaveProperty(
      "tag_name",
      "v2.0.0",
    );
  });
  test.each([
    { published: true, conflict: true },
    { prerelease: true },
    { latestVersion: "2.1.0" },
    { registryStatus: 503 },
  ])(
    "stops conflicting or prerelease publication before writes: %j",
    async (options) => {
      const { run, log } = await createReleaseFixture(options);
      expect(() => run("publish.mjs")).toThrow();
      expect(await readFile(log, "utf8")).toBe("");
    },
  );
  test.each([
    "tag_name",
    "target_commitish",
    "id",
    "body",
    "draft",
    "prerelease",
  ] as const)("rejects a mismatched PATCH response field %s", async (field) => {
    const { run, log } = await createReleaseFixture({
      staleNotes: true,
      responseMutation: field,
    });
    expect(() => run("validate.mjs")).toThrow();
    expect(await readFile(log, "utf8")).toBe("notes\n");
  });
  test.each([
    "tag_name",
    "target_commitish",
    "id",
    "body",
    "draft",
    "prerelease",
  ] as const)(
    "re-reads and rejects a mismatched stored field %s",
    async (field) => {
      const { run, log } = await createReleaseFixture({
        staleNotes: true,
        storedMutation: field,
      });
      expect(() => run("validate.mjs")).toThrow();
      expect(await readFile(log, "utf8")).toBe("notes\n");
    },
  );
  test("runs staged controller code independently from application scripts", async () => {
    const { run, log, directory } = await createReleaseFixture();
    await mkdir(path.join(directory, "scripts/release"), { recursive: true });
    await writeFile(
      path.join(directory, "scripts/release/publish.mjs"),
      'throw new Error("application helper must not run");',
    );
    run("publish.mjs");
    expect(await readFile(log, "utf8")).toBe("npm-publish\ngithub-publish\n");
  });
  test("preserves relative dependency links when staging across filesystems", async () => {
    const { run, staged } = await createReleaseFixture({ crossDevice: true });
    expect(await readlink(path.join(staged, "node_modules/marked"))).toBe(
      ".pnpm/marked",
    );
    expect(() => run("validate.mjs")).not.toThrow();
  });
  test("rejects changed identity in the publication response", async () => {
    const { run, log } = await createReleaseFixture({
      responseMutation: "tag_name",
    });
    expect(() => run("publish.mjs")).toThrow();
    expect(await readFile(log, "utf8")).toBe("npm-publish\ngithub-publish\n");
  });
  test("keeps the GitHub release draft when npm publish fails", async () => {
    const { run, log, releaseFile } = await createReleaseFixture({
      npmFails: true,
    });
    expect(() => run("publish.mjs")).toThrow();
    expect(await readFile(log, "utf8")).toBe("npm-publish\n");
    expect(JSON.parse(await readFile(releaseFile, "utf8"))).toHaveProperty(
      "draft",
      true,
    );
  });
});
