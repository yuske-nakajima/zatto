import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { Entry } from "../src/server/session.js";

/** Controllable WebSocket boundary for favorite UI scenarios. */
export class Socket extends EventTarget {
  static current: Socket;
  constructor() {
    super();
    Socket.current = this;
  }
  close() {}
}
/** Ordered files with two starred entries. */
export const initial: Entry[] = [
  { id: "a", title: "Alpha", absPath: "/docs/a.html", addedAt: 1 },
  {
    id: "b",
    title: "Beta",
    absPath: "/docs/b.html",
    addedAt: 2,
    favorite: true,
  },
  {
    id: "c",
    title: "Gamma",
    absPath: "/docs/c.html",
    addedAt: 3,
    favorite: true,
  },
];
/**
 * Publishes a server session snapshot.
 * @param entries - Server entries
 * @returns Nothing
 * @throws When React cannot apply the update
 */
export function publish(entries: Entry[]) {
  act(() =>
    Socket.current.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "session:update",
          entries,
          activeWorkspaceId: "default",
          workspaces: [{ id: "default", name: "Default" }],
        }),
      }),
    ),
  );
}
/**
 * Installs the HTTP boundary for the initial workspace.
 * @param entries - Server entries
 * @returns Fetch spy
 * @throws Never
 */
export function setup(entries = initial) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
    input === "/api/session"
      ? Response.json({
          entries,
          activeWorkspaceId: "default",
          workspaces: [{ id: "default", name: "Default" }],
        })
      : Response.json({}),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
