import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { enumerateHtmlFiles } from "../src/server/directory-import.js";

describe("HTML directory enumeration", () => {
  let tempDir: string;
  let selectedDirectory: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "zatto-directory-import-"));
    selectedDirectory = path.join(tempDir, "selected");
    await mkdir(path.join(selectedDirectory, "nested", "deeper"), {
      recursive: true,
    });
    await Promise.all([
      writeFile(path.join(selectedDirectory, "bravo.HTML"), "<title>B</title>"),
      writeFile(path.join(selectedDirectory, "alpha.htm"), "<title>A</title>"),
      writeFile(path.join(selectedDirectory, "ignored.txt"), "ignored"),
      writeFile(
        path.join(selectedDirectory, "nested", "charlie.HtM"),
        "<title>C</title>",
      ),
      writeFile(
        path.join(selectedDirectory, "nested", "deeper", "delta.html"),
        "<title>D</title>",
      ),
    ]);
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  test("directは直下のHTMLとHTMだけを相対パス順で返す", async () => {
    await expect(
      enumerateHtmlFiles(selectedDirectory, "direct"),
    ).resolves.toEqual([
      path.join(selectedDirectory, "alpha.htm"),
      path.join(selectedDirectory, "bravo.HTML"),
    ]);
  });

  test("recursiveは子孫のHTMLとHTMを相対パス順で返す", async () => {
    await expect(
      enumerateHtmlFiles(selectedDirectory, "recursive"),
    ).resolves.toEqual([
      path.join(selectedDirectory, "alpha.htm"),
      path.join(selectedDirectory, "bravo.HTML"),
      path.join(selectedDirectory, "nested", "charlie.HtM"),
      path.join(selectedDirectory, "nested", "deeper", "delta.html"),
    ]);
  });

  test("Unicodeコードポイント順で結果を安定化する", async () => {
    const privateUsePath = path.join(selectedDirectory, "\u{e000}.html");
    const emojiPath = path.join(selectedDirectory, "\u{1f600}.html");
    await writeFile(privateUsePath, "<title>Private use</title>");
    await writeFile(emojiPath, "<title>Emoji</title>");

    const paths = await enumerateHtmlFiles(selectedDirectory, "direct");

    expect(paths.slice(-2)).toEqual([privateUsePath, emojiPath]);
  });

  test("シンボリックリンクのファイルとディレクトリを辿らない", async () => {
    const outsideDirectory = path.join(tempDir, "outside");
    const outsideFile = path.join(outsideDirectory, "outside.html");
    await mkdir(outsideDirectory);
    await writeFile(outsideFile, "<title>Outside</title>");
    await symlink(
      outsideFile,
      path.join(selectedDirectory, "linked-file.html"),
    );
    await symlink(
      outsideDirectory,
      path.join(selectedDirectory, "linked-folder"),
    );

    const paths = await enumerateHtmlFiles(selectedDirectory, "recursive");

    expect(paths).not.toContain(
      path.join(selectedDirectory, "linked-file.html"),
    );
    expect(paths).not.toContain(
      path.join(selectedDirectory, "linked-folder", "outside.html"),
    );
  });

  test("選択対象と共通接頭辞を持つ隣接ディレクトリを対象にしない", async () => {
    const adjacentDirectory = `${selectedDirectory}-backup`;
    const adjacentHtmlPath = path.join(adjacentDirectory, "outside.html");
    await mkdir(adjacentDirectory);
    await writeFile(adjacentHtmlPath, "<title>Outside</title>");

    const paths = await enumerateHtmlFiles(selectedDirectory, "recursive");

    expect(paths).not.toContain(adjacentHtmlPath);
  });

  test("選択ルートがシンボリックリンクなら拒否する", async () => {
    const linkedRoot = path.join(tempDir, "linked-root");
    await symlink(selectedDirectory, linkedRoot);

    await expect(enumerateHtmlFiles(linkedRoot, "recursive")).rejects.toThrow(
      "選択対象は通常のディレクトリである必要があります",
    );
  });
});
