import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { enumerateHtmlFiles } from "../src/server/directory-import.js";
import { SessionStore } from "../src/server/session.js";

const raceHooks = vi.hoisted(() => ({
  afterLstat: undefined as ((targetPath: string) => Promise<void>) | undefined,
  afterReaddir: undefined as
    | ((targetPath: string) => Promise<void>)
    | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    lstat: async (targetPath: string) => {
      const stats = await actual.lstat(targetPath);
      await raceHooks.afterLstat?.(targetPath);
      return stats;
    },
    readdir: async (targetPath: string, options: { withFileTypes: true }) => {
      const entries = await actual.readdir(targetPath, options);
      await raceHooks.afterReaddir?.(targetPath);
      return entries;
    },
  };
});

describe("directory import filesystem changes", () => {
  let tempDir: string;
  let selectedDirectory: string;
  let outsideDirectory: string;
  let selectedFile: string;
  let outsideFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-directory-race-"));
    selectedDirectory = path.join(tempDir, "selected");
    outsideDirectory = path.join(tempDir, "outside");
    selectedFile = path.join(selectedDirectory, "inside.html");
    outsideFile = path.join(outsideDirectory, "outside.html");
    await mkdir(path.join(selectedDirectory, "nested"), { recursive: true });
    await mkdir(outsideDirectory);
    await Promise.all([
      writeFile(selectedFile, "<title>Inside</title>"),
      writeFile(
        path.join(selectedDirectory, "nested", "nested.html"),
        "<title>Nested</title>",
      ),
      writeFile(outsideFile, "<title>Outside</title>"),
    ]);
  });

  afterEach(async () => {
    raceHooks.afterLstat = undefined;
    raceHooks.afterReaddir = undefined;
    await rm(tempDir, { force: true, recursive: true });
  });

  test("rejects when the selected root changes before recursion", async () => {
    let rootChecks = 0;
    raceHooks.afterLstat = async (targetPath) => {
      if (targetPath !== selectedDirectory || ++rootChecks !== 2) return;
      await replaceWithSymlink(selectedDirectory, outsideDirectory);
    };

    await expect(
      enumerateHtmlFiles(selectedDirectory, "recursive"),
    ).rejects.toThrow();
  });

  test("rejects a directory swapped after enumeration without adding", async () => {
    raceHooks.afterReaddir = async (targetPath) => {
      if (targetPath !== selectedDirectory) return;
      raceHooks.afterReaddir = undefined;
      await replaceWithSymlink(
        path.join(selectedDirectory, "nested"),
        outsideDirectory,
      );
    };
    const store = new SessionStore(path.join(tempDir, "session.json"));
    await store.load();
    const addEntries = vi.spyOn(store, "addEntries");
    const onSessionChanged = vi.fn();
    const app = await createApp({
      sessionStore: store,
      pickDirectory: vi.fn().mockResolvedValue({
        kind: "selected",
        path: selectedDirectory,
      }),
      onSessionChanged,
      serverIdentity: { instanceId: "managed-instance", protocolVersion: 1 },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/session/pick-directory",
      headers: { "x-zatto-instance-id": "managed-instance" },
      payload: { mode: "recursive" },
    });

    expect(response.statusCode).toBe(500);
    expect(store.getSession()).toEqual({ entries: [] });
    expect(addEntries).not.toHaveBeenCalled();
    expect(onSessionChanged).not.toHaveBeenCalled();
    await app.close();
  });

  test("rejects a file swapped after directory enumeration", async () => {
    raceHooks.afterReaddir = async (targetPath) => {
      if (targetPath !== selectedDirectory) return;
      raceHooks.afterReaddir = undefined;
      await replaceWithSymlink(selectedFile, outsideFile);
    };

    await expect(
      enumerateHtmlFiles(selectedDirectory, "direct"),
    ).rejects.toThrow();
  });

  test("revalidates files at the final import boundary", async () => {
    let fileChecks = 0;
    raceHooks.afterLstat = async (targetPath) => {
      if (targetPath !== selectedFile || ++fileChecks !== 3) return;
      await replaceWithSymlink(selectedFile, outsideFile);
    };

    await expect(
      enumerateHtmlFiles(selectedDirectory, "direct"),
    ).rejects.toThrow();
  });
});

async function replaceWithSymlink(
  targetPath: string,
  sourcePath: string,
): Promise<void> {
  await rm(targetPath, { force: true, recursive: true });
  await symlink(sourcePath, targetPath);
}
