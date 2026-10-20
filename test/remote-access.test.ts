import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loopbackAddress } from "../src/server/access-guard.js";
import { createApp } from "../src/server/app.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";

const TOKEN = "secret-token";
const REMOTE = "192.168.1.20";

let dir: string;
let app: FastifyInstance;
let store: SessionStore;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-remote-access-"));
  store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
  file = path.join(dir, "docs", "plan.html");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "<title>Plan</title><p>remote</p>");
  app = await createApp({
    sessionStore: store,
    remote: { host: "0.0.0.0", token: TOKEN },
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(dir, { force: true, recursive: true });
});

const cookie = `zatto_token=${TOKEN}`;

function remoteRpc(method: string, params: unknown, headers = { cookie }) {
  return app.inject({
    method: "POST",
    url: "/rpc",
    remoteAddress: REMOTE,
    headers: {
      host: `${REMOTE}:6280`,
      "content-type": "application/json",
      ...headers,
    },
    payload: { jsonrpc: "2.0", id: 1, method, params },
  });
}

async function addFile(): Promise<string> {
  const workspaceId = store.getWorkspaceState().activeWorkspaceId;
  const added = await store.addEntriesWithResults([file], workspaceId);
  return added.resolved[0]?.id ?? "";
}

test("ループバックの接続元だけをローカルとして扱う", () => {
  for (const address of ["127.0.0.1", "127.5.0.1", "::1", "::ffff:127.0.0.1"])
    expect(loopbackAddress(address)).toBe(true);
  for (const address of ["192.168.1.20", "100.64.0.1", "::ffff:10.0.0.1"])
    expect(loopbackAddress(address)).toBe(false);
});

describe("トークン", () => {
  test("トークンのない要求は 401 で拒否する", async () => {
    expect(
      (await remoteRpc("server.health", {}, { cookie: "" })).statusCode,
    ).toBe(401);
    const page = await app.inject({
      url: "/",
      remoteAddress: REMOTE,
      headers: { host: `${REMOTE}:6280` },
    });
    expect(page.statusCode).toBe(401);
  });

  test("?token= で開くと Cookie を発行し、トークンを外した URL へ移す", async () => {
    const response = await app.inject({
      url: "/?entry=a&token=secret-token",
      remoteAddress: REMOTE,
      headers: { host: `${REMOTE}:6280` },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/?entry=a");
    expect(response.headers["set-cookie"]).toBe(
      "zatto_token=secret-token; Path=/; HttpOnly; SameSite=Strict",
    );
  });

  test("違うトークンは拒否する", async () => {
    const response = await app.inject({
      url: "/?token=wrong",
      remoteAddress: REMOTE,
      headers: { host: `${REMOTE}:6280` },
    });
    expect(response.statusCode).toBe(401);
  });

  test("--host を指定していないサーバーは外からの要求を拒否する", async () => {
    const local = await createApp({ sessionStore: store });
    const response = await local.inject({
      url: `/?token=${TOKEN}`,
      remoteAddress: REMOTE,
      headers: { host: `${REMOTE}:6280` },
    });
    expect(response.statusCode).toBe(403);
    await local.close();
  });
});

describe("外の端末に許す操作", () => {
  test("閲覧の結果から絶対パスとネイティブの選択を除き、remote と示す", async () => {
    const id = await addFile();
    const session = (await remoteRpc("session.get", {})).json().result;
    expect(session).toMatchObject({
      access: "remote",
      entries: [{ id, absPath: "plan.html", title: "Plan" }],
      filePicker: { available: false },
      directoryPicker: { available: false },
    });
    const workspace = (
      await remoteRpc("workspaces.get", { id: session.activeWorkspaceId })
    ).json().result;
    expect(workspace.entries[0].absPath).toBe("plan.html");
    const search = (await remoteRpc("search.query", { query: "remote" })).json()
      .result;
    expect(search.files[0].absPath).toBe("plan.html");
    expect(JSON.stringify([session, workspace, search])).not.toContain(dir);
  });

  test("閲覧以外の操作は forbidden で拒否する", async () => {
    const workspaceId = store.getWorkspaceState().activeWorkspaceId;
    for (const [method, params] of [
      ["session.add", { paths: [file], workspaceId }],
      ["workspaces.activate", { id: workspaceId }],
      ["review.states", {}],
      ["server.shutdown", {}],
      ["agentContext.get", {}],
    ] as const)
      expect((await remoteRpc(method, params)).json().error).toMatchObject({
        code: 1008,
        data: { kind: "forbidden" },
      });
    expect(store.getSession().entries).toEqual([]);
  });

  test("選択中でないワークスペースのファイルもプレビューでき、添付画像は配信しない", async () => {
    const id = await addFile();
    const other = await store.createWorkspace("other");
    await store.switchWorkspace(other.id);
    const preview = await app.inject({
      url: `/f/${id}/`,
      remoteAddress: REMOTE,
      headers: { host: `${REMOTE}:6280`, cookie },
    });
    expect(preview.statusCode).toBe(200);
    const local = await app.inject({
      url: `/f/${id}/`,
      headers: { host: "127.0.0.1:6280" },
    });
    expect(local.statusCode).toBe(404);
    const attachment = await app.inject({
      url: "/review-attachments/a.png",
      remoteAddress: REMOTE,
      headers: { host: `${REMOTE}:6280`, cookie },
    });
    expect(attachment.statusCode).toBe(403);
  });
});

test("外の端末のタブには、絶対パスを除いた一覧とファイルの更新だけを配信し、Mac のタブとして数えない", () => {
  const hub = new RealtimeHub();
  const socket = () => ({ readyState: 1, once: vi.fn(), send: vi.fn() });
  const viewer = socket();
  const remote = socket();
  hub.add(viewer as never, "viewer");
  hub.add(remote as never, "remote");
  expect(hub.viewerCount()).toBe(1);

  const entries = [
    { id: "a", absPath: "/Users/me/docs/plan.html", title: "Plan", addedAt: 1 },
  ];
  hub.broadcast({ type: "session:update", entries });
  hub.broadcast({ type: "file:changed", id: "a" });
  hub.broadcast({ type: "review:event", session: "s" });
  hub.broadcast({ type: "viewer:show", workspaceId: "w", entryId: "a" });

  expect(viewer.send).toHaveBeenCalledTimes(4);
  expect(
    remote.send.mock.calls.map(([payload]) => JSON.parse(payload)),
  ).toEqual([
    {
      type: "session:update",
      entries: [{ ...entries[0], absPath: "plan.html" }],
    },
    { type: "file:changed", id: "a" },
  ]);
});
