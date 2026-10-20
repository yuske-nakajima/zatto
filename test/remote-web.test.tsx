// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Entry } from "../src/server/session.js";
import { App } from "../src/web/App.js";
import { rpcFixture } from "./rpc-client-fixture.js";

const plan: Entry = {
  id: "plan",
  title: "Plan",
  absPath: "plan.html",
  addedAt: 1,
};
const notes: Entry = {
  id: "notes",
  title: "Notes",
  absPath: "notes.md",
  addedAt: 2,
};

class FakeWebSocket extends EventTarget {
  close(): void {}
}

let methods: string[];

beforeEach(() => {
  methods = [];
  window.history.replaceState(null, "", "/?entry=plan");
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      rpcFixture(async (method, init) => {
        methods.push(String(method));
        const params = JSON.parse(String(init?.body));
        if (method === "session.get")
          return Response.json({
            access: "remote",
            entries: [plan],
            activeWorkspaceId: "default",
            workspaces: [
              { id: "default", name: "Default" },
              { id: "other", name: "Other" },
            ],
            filePicker: { available: false },
            directoryPicker: { available: false },
          });
        if (method === "workspaces.get")
          return Response.json({
            id: params.id,
            name: "Other",
            entries: [notes],
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

test("外の端末では閲覧に要らない操作とレビューを出さない", async () => {
  render(<App />);
  await screen.findByTitle("Plan preview");

  for (const name of [
    "Folders",
    "Clear All",
    "New workspace",
    "Rename",
    "Delete",
    "Copy",
  ])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Copy file path/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  expect(
    methods.filter(
      (method) => method.startsWith("review.") || method === "agentContext.set",
    ),
  ).toEqual([]);
});

test("外の端末では、サーバーの選択を変えずにワークスペースを切り替える", async () => {
  render(<App />);
  await screen.findByTitle("Plan preview");

  fireEvent.change(screen.getByLabelText("Workspace"), {
    target: { value: "other" },
  });

  await screen.findByTitle("Notes preview");
  expect(methods).toContain("workspaces.get");
  expect(methods).not.toContain("workspaces.activate");
  expect(new URL(window.location.href).searchParams.get("workspace")).toBe(
    "other",
  );
});
