import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-rpc-"));
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});
const call = (method: string, id: unknown = 1, params: unknown = {}) => ({
  jsonrpc: "2.0",
  method,
  id,
  params,
});
test("preserves valid IDs and rejects malformed requests, params, and inherited methods", async () => {
  const app = await createApp({
    sessionStore: new SessionStore(path.join(dir, "session.json")),
  });
  for (const id of [0, null, "abc"]) {
    const response = await app.inject({
      method: "POST",
      url: "/rpc",
      payload: call("server.health", id),
    });
    expect(response.json()).toMatchObject({
      jsonrpc: "2.0",
      id,
      result: { name: "zatto" },
    });
  }
  for (const [payload, code] of [
    [call("toString"), -32601],
    [call("session.add", 1, []), -32602],
    [call("server.health", false), -32600],
    [[], -32600],
    [null, -32600],
  ] as const) {
    const response = await app.inject({
      method: "POST",
      url: "/rpc",
      payload: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });
    expect(response.json().error.code).toBe(code);
  }
  const malformed = await app.inject({
    method: "POST",
    url: "/rpc",
    payload: "{",
    headers: { "content-type": "application/json" },
  });
  expect(malformed.json()).toMatchObject({ id: null, error: { code: -32700 } });
  expect((await app.inject("/api/health")).statusCode).toBe(404);
  await app.close();
});
test("executes batches in order, continues after errors, and omits notification responses", async () => {
  const store = new SessionStore(path.join(dir, "session.json"));
  const app = await createApp({ sessionStore: store });
  const response = await app.inject({
    method: "POST",
    url: "/rpc",
    payload: [
      call("workspaces.create", 0, { name: "Created" }),
      call("missing", 1),
      {
        jsonrpc: "2.0",
        method: "workspaces.create",
        params: { name: "Notification" },
      },
      call("workspaces.list", 2),
    ],
  });
  const body = response.json();
  expect(body).toHaveLength(3);
  expect(body[0].id).toBe(0);
  expect(body[1].error.code).toBe(-32601);
  expect(
    body[2].result.workspaces.map((item: { name: string }) => item.name),
  ).toEqual(["Default", "Created", "Notification"]);
  const log = vi.spyOn(app.log, "error");
  const notification = await app.inject({
    method: "POST",
    url: "/rpc",
    payload: { jsonrpc: "2.0", method: "session.add", params: {} },
  });
  expect(notification.statusCode).toBe(204);
  expect(notification.body).toBe("");
  expect(log).toHaveBeenCalled();
  await app.close();
});
test("defers shutdown until the complete batch response has finished", async () => {
  const shutdown = vi.fn();
  const app = await createApp({
    sessionStore: new SessionStore(path.join(dir, "session.json")),
    shutdown,
  });
  const response = await app.inject({
    method: "POST",
    url: "/rpc",
    payload: [
      call("server.shutdown"),
      call("workspaces.create", 2, { name: "Before shutdown" }),
    ],
  });
  expect(response.json()[1].result.name).toBe("Before shutdown");
  await new Promise((resolve) => setImmediate(resolve));
  expect(shutdown).toHaveBeenCalledOnce();
  await app.close();
});
test("invalid envelopes use null IDs while valid notifications never produce responses", async () => {
  const app = await createApp({
    sessionStore: new SessionStore(path.join(dir, "session.json")),
  });
  for (const payload of [
    1,
    "method",
    {},
    { jsonrpc: "1.0", id: 7, method: "server.health" },
    { jsonrpc: "2.0", method: 1, id: "x" },
    call("server.health", {}),
    call("server.health", []),
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/rpc",
      payload: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });
    expect(response.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });
  }
  for (const payload of [
    { jsonrpc: "2.0", method: "server.health" },
    [
      { jsonrpc: "2.0", method: "missing" },
      { jsonrpc: "2.0", method: "server.health" },
    ],
  ]) {
    const response = await app.inject({ method: "POST", url: "/rpc", payload });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  }
  for (const params of [null, [], "x", false]) {
    const response = await app.inject({
      method: "POST",
      url: "/rpc",
      payload: call("session.get", 0, params),
    });
    expect(response.json()).toMatchObject({ id: 0, error: { code: -32602 } });
  }
  await app.close();
});
test("all removed REST operation endpoints return 404", async () => {
  const app = await createApp({
    sessionStore: new SessionStore(path.join(dir, "session.json")),
  });
  for (const [method, url] of [
    ["GET", "/api/health"],
    ["POST", "/api/shutdown"],
    ["GET", "/api/session"],
    ["POST", "/api/session/add"],
    ["PUT", "/api/session"],
    ["GET", "/api/session/export"],
    ["POST", "/api/session/pick"],
    ["POST", "/api/session/pick-directory"],
    ["PATCH", "/api/session/id/favorite"],
    ["PATCH", "/api/session/order"],
    ["DELETE", "/api/session/entries"],
    ["DELETE", "/api/session/id"],
    ["DELETE", "/api/session"],
    ["GET", "/api/workspaces"],
    ["POST", "/api/workspaces"],
    ["PUT", "/api/workspaces/id/activate"],
    ["PATCH", "/api/workspaces/id"],
    ["DELETE", "/api/workspaces/id"],
    ["GET", "/api/agent/context"],
    ["PUT", "/api/agent/context"],
    ["GET", "/api/search"],
  ] as const) {
    expect((await app.inject({ method, url })).statusCode).toBe(404);
  }
  await app.close();
});
