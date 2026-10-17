// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { MARKDOWN_TASK_MESSAGE } from "../src/shared/markdown-task-message.js";
import { App } from "../src/web/App.js";
import { rpcFixture } from "./rpc-client-fixture.js";

const entries: Entry[] = [
  { id: "notes", title: "Notes", absPath: "/work/notes.md", addedAt: 1 },
];

class FakeWebSocket extends EventTarget {
  close(): void {}
}

function postFromFrame(data: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const replies = (event: MessageEvent) => {
      if (event.data?.type !== MARKDOWN_TASK_MESSAGE.result) return;
      window.removeEventListener("message", replies);
      resolve(event.data);
    };
    window.addEventListener("message", replies);
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: window.location.origin,
        source: window,
      }),
    );
  });
}

describe("Markdownのタスク切り替え", () => {
  let setTask: ReturnType<typeof vi.fn<(params: unknown) => void>>;

  beforeEach(() => {
    window.history.replaceState(null, "", "/?entry=notes");
    vi.stubGlobal("WebSocket", FakeWebSocket);
    setTask = vi.fn<(params: unknown) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        rpcFixture(async (method, init) => {
          if (method === "session.get") return Response.json({ entries });
          if (method === "markdown.setTask") {
            const params = JSON.parse(String(init?.body));
            setTask(params);
            return params.revision === "stale"
              ? Response.json(
                  {
                    jsonrpc: "2.0",
                    id: 0,
                    error: { code: 1007, message: "changed" },
                  },
                  { status: 409 },
                )
              : Response.json({ revision: "next" });
          }
          return new Response(null, { status: 204 });
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("選択中ファイルの変更を表示中のワークスペースへ保存し、新しいrevisionを返す", async () => {
    render(<App />);
    await screen.findByTitle("Notes preview");

    await expect(
      postFromFrame({
        type: MARKDOWN_TASK_MESSAGE.request,
        entryId: "notes",
        index: 2,
        checked: true,
        revision: "current",
      }),
    ).resolves.toEqual({
      type: MARKDOWN_TASK_MESSAGE.result,
      ok: true,
      revision: "next",
    });
    expect(setTask).toHaveBeenCalledWith({
      workspaceId: "default",
      id: "notes",
      index: 2,
      checked: true,
      revision: "current",
    });
  });

  test("保存できない場合はエラーを表示し、再読み込みを求める", async () => {
    render(<App />);
    await screen.findByTitle("Notes preview");

    await expect(
      postFromFrame({
        type: MARKDOWN_TASK_MESSAGE.request,
        entryId: "notes",
        index: 0,
        checked: true,
        revision: "stale",
      }),
    ).resolves.toEqual({ type: MARKDOWN_TASK_MESSAGE.result, ok: false });
    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not update the task. The file was reloaded with its latest content.",
        ),
      ).toBeTruthy(),
    );
  });

  test("選択中でないファイルからの要求は保存しない", async () => {
    render(<App />);
    await screen.findByTitle("Notes preview");

    await expect(
      postFromFrame({
        type: MARKDOWN_TASK_MESSAGE.request,
        entryId: "other",
        index: 0,
        checked: true,
        revision: "current",
      }),
    ).resolves.toEqual({ type: MARKDOWN_TASK_MESSAGE.result, ok: false });
    expect(setTask).not.toHaveBeenCalled();
  });
});
