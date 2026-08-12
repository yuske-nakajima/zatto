// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useSessionTransfer } from "../src/web/useSessionTransfer.js";

const exchange = {
  format: "zatto-session" as const,
  version: 1 as const,
  entries: [{ path: "/z.html" }, { path: "/a.html" }],
};

describe("session transfer modes", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("merge modeをqueryへ渡し、検索をresetしない", async () => {
    const applyImportedEntries = vi.fn();
    const resetSearch = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ entries: [] }),
    );
    vi.stubGlobal("fetch", fetch);
    const file = new File([JSON.stringify(exchange)], "session.json");
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(exchange),
    });
    const { result } = renderHook(() =>
      useSessionTransfer({
        instanceId: "managed",
        applyImportedEntries,
        resetSearch,
        setErrorMessage: vi.fn(),
      }),
    );

    await act(() => result.current.importFile(file, "merge"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/session?mode=merge",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(applyImportedEntries).toHaveBeenCalledWith([], "merge");
    expect(resetSearch).not.toHaveBeenCalled();
  });

  test("sort orderはpath順にしたJSONをdownloadする", async () => {
    let downloadedBlob: Blob | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => Response.json(exchange)),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return "blob:zatto-session";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { result } = renderHook(() =>
      useSessionTransfer({
        instanceId: null,
        applyImportedEntries: vi.fn(),
        resetSearch: vi.fn(),
        setErrorMessage: vi.fn(),
      }),
    );

    await act(() => result.current.exportFile("sort"));

    const downloaded = JSON.parse(await readBlob(downloadedBlob as Blob));
    expect(downloaded.entries).toEqual([
      { path: "/a.html" },
      { path: "/z.html" },
    ]);
  });
});

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}
