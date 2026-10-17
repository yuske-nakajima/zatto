import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session.js";

test("rejects simple-request content types without mutating state, while accepting JSON with charset", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "zatto-rpc-content-"));
  const store = new SessionStore(path.join(dir, "session.json"));
  const app = await createApp({ sessionStore: store });
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "workspaces.create",
    params: { name: "Unexpected" },
  });
  try {
    for (const contentType of [
      "text/plain",
      "text/plain; charset=UTF-8",
      "application/x-www-form-urlencoded",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/rpc",
        headers: { "content-type": contentType, origin: "https://example.com" },
        payload,
      });
      expect(response.statusCode).toBe(415);
      expect(store.getWorkspaceState().workspaces).toHaveLength(1);
    }
    const accepted = await app.inject({
      method: "POST",
      url: "/rpc",
      headers: { "content-type": "application/json; charset=UTF-8" },
      payload,
    });
    expect(accepted.json().result.name).toBe("Unexpected");
    expect(store.getWorkspaceState().workspaces).toHaveLength(2);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
