import { describe, expect, test, vi } from "vitest";
import { createNativeFilePicker } from "../src/server/file-picker.js";

describe("native file picker", () => {
  test("macOSで選択した複数の絶対パスを返す", async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValue("/tmp/alpha.html\0/tmp/bravo.htm\n");
    const pickFiles = createNativeFilePicker("darwin", runCommand);

    await expect(pickFiles?.()).resolves.toEqual({
      kind: "selected",
      paths: ["/tmp/alpha.html", "/tmp/bravo.htm"],
    });
    expect(runCommand).toHaveBeenCalledWith(
      "/usr/bin/osascript",
      expect.arrayContaining(["-e", expect.stringContaining("choose file")]),
    );
  });

  test("macOSの選択キャンセルを通常結果として返す", async () => {
    const runCommand = vi.fn().mockResolvedValue("__ZATTO_CANCELLED__\n");
    const pickFiles = createNativeFilePicker("darwin", runCommand);

    await expect(pickFiles?.()).resolves.toEqual({ kind: "cancelled" });
  });

  test("macOS以外ではファイル選択を提供しない", () => {
    expect(createNativeFilePicker("linux", vi.fn())).toBeUndefined();
    expect(createNativeFilePicker("win32", vi.fn())).toBeUndefined();
  });
});
