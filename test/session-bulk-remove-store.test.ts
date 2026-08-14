import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SessionStore } from "../src/server/session.js";
import { writeFileAtomically } from "../src/shared/atomic-file.js";

describe("SessionStore bulk removal", () => {
  let tempDir: string;
  let sessionFilePath: string;
  let htmlPaths: string[];

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-bulk-store-"));
    sessionFilePath = path.join(tempDir, "session.json");
    htmlPaths = ["first.html", "second.html", "third.html"].map((name) =>
      path.join(tempDir, name),
    );
    await Promise.all(
      htmlPaths.map((htmlPath, index) =>
        writeFile(htmlPath, `<title>Entry ${index}</title>`, "utf8"),
      ),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { force: true, recursive: true });
  });

  test("指定した全IDを1回で永続化し、残るエントリの順序とmetadataを保つ", async () => {
    const writeSessionFile = vi.fn(writeFileAtomically);
    const store = new SessionStore(sessionFilePath, writeSessionFile);
    await store.load();
    const entries = await store.addEntries(htmlPaths);
    writeSessionFile.mockClear();

    await expect(
      store.removeEntries([entries[0].id, entries[2].id]),
    ).resolves.toBe(true);

    expect(writeSessionFile).toHaveBeenCalledOnce();
    expect(store.getSession()).toEqual({ entries: [entries[1]] });
    const persisted = JSON.parse(await readFile(sessionFilePath, "utf8"));
    expect(persisted).toEqual({ entries: [entries[1]] });
  });

  test.each([
    ["空のID配列", []],
    ["空文字のID", [""]],
    ["重複ID", ["known", "known"]],
    ["不明なIDを含む集合", ["known", "missing"]],
  ])("%sを拒否し、memoryと永続ファイルを変更しない", async (_name, ids) => {
    const writeSessionFile = vi.fn(writeFileAtomically);
    const store = new SessionStore(sessionFilePath, writeSessionFile);
    await store.load();
    const entries = await store.addEntries(htmlPaths);
    const normalizedIds = ids.map((id) =>
      id === "known" ? entries[0].id : id,
    );
    const sessionBefore = store.getSession();
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    writeSessionFile.mockClear();

    await expect(store.removeEntries(normalizedIds)).resolves.toBe(false);

    expect(writeSessionFile).not.toHaveBeenCalled();
    expect(store.getSession()).toEqual(sessionBefore);
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
  });

  test("永続化に失敗した場合はmemoryと永続ファイルを変更しない", async () => {
    let rejectWrites = false;
    const writeSessionFile = vi.fn(async (target: string, content: string) => {
      if (rejectWrites) throw new Error("bulk persistence failed");
      await writeFileAtomically(target, content);
    });
    const store = new SessionStore(sessionFilePath, writeSessionFile);
    await store.load();
    const entries = await store.addEntries(htmlPaths);
    const sessionBefore = store.getSession();
    const persistedBefore = await readFile(sessionFilePath, "utf8");
    rejectWrites = true;

    await expect(
      store.removeEntries([entries[0].id, entries[2].id]),
    ).rejects.toThrow("bulk persistence failed");

    expect(store.getSession()).toEqual(sessionBefore);
    expect(await readFile(sessionFilePath, "utf8")).toBe(persistedBefore);
  });
});
