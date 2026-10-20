// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import type { ServerMessage } from "../src/shared/protocol.js";
import { App } from "../src/web/App.js";
import { rpcFixture } from "./rpc-client-fixture.js";

const entries: Entry[] = [
  { id: "plan", title: "Plan", absPath: "/work/plan.md", addedAt: 1 },
  { id: "notes", title: "Notes", absPath: "/work/notes.md", addedAt: 2 },
];

const sockets: FakeWebSocket[] = [];
class FakeWebSocket extends EventTarget {
  constructor(readonly url: string) {
    super();
    sockets.push(this);
  }
  close(): void {}
}

function send(message: ServerMessage): void {
  for (const socket of sockets)
    socket.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
}

beforeEach(() => {
  sockets.length = 0;
  window.history.replaceState(null, "", "/?entry=plan");
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      rpcFixture(async (method) => {
        if (method === "session.get")
          return Response.json({
            entries,
            activeWorkspaceId: "default",
            workspaces: [{ id: "default", name: "Default" }],
          });
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

test("Web UI のタブとして接続し、表示を頼まれたファイルを開く", async () => {
  render(<App />);
  await screen.findByTitle("Plan preview");
  expect(sockets.map(({ url }) => new URL(url).search)).toEqual([
    "?client=viewer",
  ]);

  send({ type: "viewer:show", workspaceId: "other", entryId: "notes" });
  send({ type: "viewer:show", workspaceId: "default", entryId: "notes" });

  await screen.findByTitle("Notes preview");
  expect(new URL(window.location.href).searchParams.get("entry")).toBe("notes");
});
