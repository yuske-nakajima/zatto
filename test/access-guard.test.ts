import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-access-guard-"));
  const store = new SessionStore(path.join(dir, "session.json"));
  await store.load();
  app = await createApp({ sessionStore: store });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(dir, { force: true, recursive: true });
});

function health(host: string) {
  return app.inject({
    method: "POST",
    url: "/rpc",
    headers: { host, "content-type": "application/json" },
    payload: { jsonrpc: "2.0", id: 1, method: "server.health", params: {} },
  });
}

test("ループバックの Host だけを受け付ける", async () => {
  for (const host of ["127.0.0.1:6280", "localhost:6280", "[::1]:6280"])
    expect((await health(host)).statusCode).toBe(200);
  for (const host of ["attacker.example:6280", "127.0.0.1.attacker.example"])
    expect((await health(host)).statusCode).toBe(403);
  const view = await app.inject({
    url: "/f/missing/",
    headers: { host: "attacker.example:6280" },
  });
  expect(view.statusCode).toBe(403);
});

test("/ws はほかのサイトの Origin を拒否し、ループバックの Origin と Origin のない接続を受け付ける", async () => {
  const connect = (headers: Record<string, string>) =>
    app.injectWS("/ws", { headers: { host: "127.0.0.1:6280", ...headers } });

  for (const headers of [
    {},
    { origin: "http://127.0.0.1:6280" },
    { origin: "http://localhost:6280" },
  ] as Record<string, string>[])
    (await connect(headers)).terminate();
  for (const origin of [
    "https://attacker.example",
    "null",
    "http://127.0.0.1.attacker.example",
  ])
    await expect(connect({ origin })).rejects.toThrow(
      "Unexpected server response: 403",
    );
});
