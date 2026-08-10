import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeSessionExchangeFile } from "../src/cli/session-file.js";

describe("session exchange file persistence", () => {
  let tempDir: string;
  let exchangeFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-file-atomic-"));
    exchangeFilePath = path.join(tempDir, "saved-session.json");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("export書込み失敗時は既存出力を維持する", async () => {
    await writeFile(exchangeFilePath, "existing output\n", "utf8");

    await expect(
      writeSessionExchangeFile(
        exchangeFilePath,
        { format: "zatto-session", version: 1, entries: [] },
        {
          beforeRename: () => {
            throw new Error("rename failed");
          },
        },
      ),
    ).rejects.toThrow("rename failed");

    expect(await readFile(exchangeFilePath, "utf8")).toBe("existing output\n");
    expect(await readdir(tempDir)).toEqual(["saved-session.json"]);
  });
});
