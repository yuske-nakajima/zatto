import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

describe("atomic file replacement", () => {
  let tempDir: string;
  let targetPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-atomic-write-"));
    targetPath = path.join(tempDir, "session.json");
    await writeFile(targetPath, "before\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("同一ディレクトリの一時ファイルを同期して置き換える", async () => {
    let synced = false;
    await writeFileAtomically(targetPath, "after\n", {
      afterSync: () => {
        synced = true;
      },
      beforeRename: () => {
        expect(synced).toBe(true);
      },
    });

    expect(await readFile(targetPath, "utf8")).toBe("after\n");
    expect(await readdir(tempDir)).toEqual(["session.json"]);
  });

  test("rename失敗時は既存ファイルを維持して一時ファイルを清掃する", async () => {
    await expect(
      writeFileAtomically(targetPath, "after\n", {
        beforeRename: () => {
          throw new Error("rename failed");
        },
      }),
    ).rejects.toThrow("rename failed");

    expect(await readFile(targetPath, "utf8")).toBe("before\n");
    expect(await readdir(tempDir)).toEqual(["session.json"]);
  });
});
