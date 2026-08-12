// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useSessionTransfer } from "../src/web/useSessionTransfer.js";

describe("session export filename", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("保存時のローカル時刻をゼロ埋めしたdownload属性に設定する", async () => {
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ format: "zatto-session", version: 1, entries: [] }),
      ),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:zatto-session"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function captureDownloadName(this: HTMLAnchorElement) {
        downloadName = this.download;
      },
    );
    const { result } = renderHook(() =>
      useSessionTransfer({
        instanceId: null,
        applyImportedEntries: vi.fn(),
        resetSearch: vi.fn(),
        setErrorMessage: vi.fn(),
      }),
    );

    await act(() => result.current.exportFile("keep"));

    expect(downloadName).toBe("zatto-session-20260102-030405.json");
  });
});
