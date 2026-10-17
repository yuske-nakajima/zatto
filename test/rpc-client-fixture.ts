import { expect } from "vitest";

/** Adapts method-keyed result fixtures to the real JSON-RPC transport envelope. */
export function rpcFixture(handler: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (!String(input).endsWith("/rpc"))
      throw new Error(`Unexpected transport: ${String(input)}`);
    const request = JSON.parse(String(init?.body));
    const response = await handler(request.method, {
      ...init,
      body: JSON.stringify(request.params),
    });
    if (!response.ok) return response;
    let result: unknown =
      response.status === 204 ? null : await response.json();
    if (request.method === "session.get") {
      result = {
        activeWorkspaceId: "default",
        workspaces: [{ id: "default", name: "Default" }],
        filePicker: { available: false },
        directoryPicker: { available: false },
        ...(result as object),
      };
    } else if (request.method === "search.query") {
      result = { query: request.params.query, ...(result as object) };
    } else if (
      [
        "session.remove",
        "session.removeMany",
        "session.clear",
        "session.reorder",
        "session.setFavorite",
        "agentContext.set",
      ].includes(request.method)
    ) {
      result = null;
    } else if (
      [
        "workspaces.activate",
        "workspaces.delete",
        "workspaces.rename",
      ].includes(request.method)
    ) {
      result = {
        entries: [],
        activeWorkspaceId: request.params.id,
        workspaces: [{ id: request.params.id, name: "Fixture" }],
        ...(result as object),
      };
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  };
}
/** Matches a real RPC request while leaving the generated request ID unspecified. */
export function rpcRequest(method: string, params: unknown = {}) {
  return expect.objectContaining({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: {
      asymmetricMatch(value: unknown) {
        if (typeof value !== "string") return false;
        try {
          return expect
            .objectContaining({
              jsonrpc: "2.0",
              id: expect.any(Number),
              method,
              params: expect.objectContaining(params),
            })
            .asymmetricMatch(JSON.parse(value));
        } catch {
          return false;
        }
      },
    },
  });
}
export function rpcMethod(init?: RequestInit): string {
  return JSON.parse(String(init?.body)).method;
}
