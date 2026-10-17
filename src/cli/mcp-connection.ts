import type { ZattoConnection } from "../mcp/server.js";
import { rpcCall } from "../shared/rpc-client.js";
import { serverUrl } from "./server-api.js";
import { connectToRunningServer } from "./server-client.js";

interface McpConnectionDependencies {
  fetch: typeof globalThis.fetch;
  runtimeFilePath: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Connects MCP tool calls to the already running viewer without starting one.
 * @param dependencies - HTTP transport and runtime record location
 * @returns Connector resolving the server identity for each tool call
 * @throws Never during construction
 */
export function createMcpConnector(
  dependencies: McpConnectionDependencies,
): () => Promise<ZattoConnection> {
  return async () => {
    const record = await connectToRunningServer(dependencies);
    const baseUrl = serverUrl(record.port);
    return {
      baseUrl,
      call: (method, params) =>
        rpcCall(
          method,
          { ...params, instanceId: record.instanceId },
          {
            endpoint: `${baseUrl}rpc`,
            fetch: dependencies.fetch,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        ),
    };
  };
}
