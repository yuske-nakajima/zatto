import type { ServerRecord } from "../server/runtime.js";
import {
  type AgentContext,
  parseAgentContext,
} from "../shared/agent-context.js";
import { rpcCall } from "../shared/rpc-client.js";
import { serverUrl } from "./server-api.js";
import { connectToRunningServer } from "./server-client.js";

interface AgentContextClientDependencies {
  fetch: typeof globalThis.fetch;
  runtimeFilePath: string;
}

export function createAgentContextReader(
  dependencies: AgentContextClientDependencies,
): () => Promise<AgentContext> {
  return async () => {
    const record = await connectToRunningServer(dependencies);
    return requestAgentContext(record, dependencies.fetch);
  };
}

export async function requestAgentContext(
  record: ServerRecord,
  fetchFn: typeof globalThis.fetch,
): Promise<AgentContext> {
  return parseAgentContext(
    await rpcCall(
      "agentContext.get",
      { instanceId: record.instanceId },
      {
        endpoint: `${serverUrl(record.port)}rpc`,
        fetch: fetchFn,
        signal: AbortSignal.timeout(1_000),
      },
    ),
  );
}
