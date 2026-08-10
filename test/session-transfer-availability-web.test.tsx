// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/web/App.js";

class FakeWebSocket extends EventTarget {
  close(): void {}
}

describe("session transfer availability", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test.each([
    ["managed", { serverIdentity: { instanceId: "managed" } }],
    ["unmanaged", {}],
  ])("初期session取得後に%s importを有効化する", async (_label, capability) => {
    let resolveSession: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(
        () =>
          new Promise<Response>((resolve) => {
            resolveSession = resolve;
          }),
      ),
    );
    render(<App />);
    const input = screen.getByLabelText("Import session file");

    expect(input.hasAttribute("disabled")).toBe(true);
    resolveSession?.(Response.json({ entries: [], ...capability }));

    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
  });
});
