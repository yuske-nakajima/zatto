import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AgentContextStore } from "../src/server/agent-context.js";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("AIエージェント向けコンテキストAPI", () => {
  test("セッションとブラウザー状態からコンテキストを生成する", async () => {
    const { app, entries } = await createFixture();

    const update = await app.inject({
      method: "PUT",
      url: "/api/agent/context",
      payload: { activeEntryId: entries[1]?.id, view: "search" },
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/agent/context",
    });

    expect(update.statusCode).toBe(204);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      schemaVersion: 1,
      activeFile: entries[1]?.absPath,
      openFiles: entries.map(({ absPath }) => absPath),
      view: "search",
    });
    await app.close();
  });

  test("ブラウザー状態がない場合もセッション一覧を返す", async () => {
    const { app, entries } = await createFixture();

    const response = await app.inject({
      method: "GET",
      url: "/api/agent/context",
    });

    expect(response.json()).toEqual({
      schemaVersion: 1,
      activeFile: null,
      openFiles: entries.map(({ absPath }) => absPath),
      view: "preview",
    });
    await app.close();
  });

  test.each([
    [{ activeEntryId: "missing", view: "preview" }],
    [{ activeEntryId: null, view: "other" }],
    [{ activeEntryId: 1, view: "docs" }],
    [[]],
  ])("不正なブラウザー状態を拒否する: %j", async (payload) => {
    const { app } = await createFixture();

    const response = await app.inject({
      method: "PUT",
      url: "/api/agent/context",
      payload,
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  test("削除された選択エントリは未選択として返す", async () => {
    const { app, store, entries } = await createFixture();
    await app.inject({
      method: "PUT",
      url: "/api/agent/context",
      payload: { activeEntryId: entries[0]?.id, view: "docs" },
    });
    await store.removeEntry(entries[0]?.id ?? "");

    const response = await app.inject({
      method: "GET",
      url: "/api/agent/context",
    });

    expect(response.json()).toMatchObject({
      activeFile: null,
      openFiles: [entries[1]?.absPath],
      view: "docs",
    });
    await app.close();
  });
});

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zatto-agent-"));
  temporaryDirectories.push(directory);
  const files = [
    path.join(directory, "a.html"),
    path.join(directory, "b.html"),
  ];
  await Promise.all(
    files.map((file, index) =>
      writeFile(file, `<title>Page ${index + 1}</title>`, "utf8"),
    ),
  );
  const store = new SessionStore(path.join(directory, "session.json"));
  const entries = await store.addEntries(files);
  const app = await createApp({
    sessionStore: store,
    agentContextStore: new AgentContextStore(),
  });
  return { app, store, entries };
}
