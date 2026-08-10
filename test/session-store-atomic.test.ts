import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SessionStore } from "../src/server/session.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

describe("SessionStore atomic persistence", () => {
  let tempDir: string;
  let sessionFilePath: string;
  let firstPath: string;
  let secondPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-store-atomic-"));
    sessionFilePath = path.join(tempDir, "config", "session.json");
    firstPath = path.join(tempDir, "first.html");
    secondPath = path.join(tempDir, "second.html");
    await writeFile(firstPath, "<title>First</title>", "utf8");
    await writeFile(secondPath, "<title>Second</title>", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("永続化失敗時は既存セッションを維持して一時ファイルを除去する", async () => {
    const initialStore = new SessionStore(sessionFilePath);
    await initialStore.load();
    const [previous] = await initialStore.addEntries([firstPath]);
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    let writeCount = 0;
    const store = new SessionStore(sessionFilePath, async (target, content) => {
      writeCount += 1;
      await writeFileAtomically(target, content, {
        beforeRename:
          writeCount === 2
            ? () => {
                throw new Error("rename failed");
              }
            : undefined,
      });
    });
    await store.load();

    await expect(store.addEntries([secondPath])).rejects.toThrow(
      "rename failed",
    );

    expect(store.getSession()).toEqual({ entries: [previous] });
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
    expect((await readdir(path.dirname(sessionFilePath))).sort()).toEqual([
      "session.json",
    ]);
  });
});
