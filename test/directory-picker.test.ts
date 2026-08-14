import { describe, expect, test, vi } from "vitest";
import { createNativeDirectoryPicker } from "../src/server/file-picker.js";

describe("native directory picker", () => {
  test("macOSで選択したディレクトリの絶対パスを返す", async () => {
    const runCommand = vi.fn().mockResolvedValue("/tmp/html-pages/\n");
    const pickDirectory = createNativeDirectoryPicker("darwin", runCommand);

    await expect(pickDirectory?.()).resolves.toEqual({
      kind: "selected",
      path: "/tmp/html-pages/",
    });
    expect(runCommand).toHaveBeenCalledWith(
      "/usr/bin/osascript",
      expect.arrayContaining(["-e", expect.stringContaining("choose folder")]),
    );
  });

  test("macOSの選択キャンセルを通常結果として返す", async () => {
    const runCommand = vi.fn().mockResolvedValue("__ZATTO_CANCELLED__\n");
    const pickDirectory = createNativeDirectoryPicker("darwin", runCommand);

    await expect(pickDirectory?.()).resolves.toEqual({ kind: "cancelled" });
  });

  test("macOS以外ではディレクトリ選択を提供しない", () => {
    expect(createNativeDirectoryPicker("linux", vi.fn())).toBeUndefined();
    expect(createNativeDirectoryPicker("win32", vi.fn())).toBeUndefined();
  });
});
