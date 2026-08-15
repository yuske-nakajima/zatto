import type { ServerRecord } from "../server/runtime.js";
import {
  type AgentContext,
  parseAgentContext,
} from "../shared/agent-context.js";
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
  const response = await fetchFn(`${serverUrl(record.port)}api/agent/context`, {
    headers: { "x-zatto-instance-id": record.instanceId },
    signal: AbortSignal.timeout(1_000),
  });
  if (!response.ok) {
    throw new Error(
      `Agentコンテキストの取得に失敗しました (HTTP ${response.status})`,
    );
  }
  return parseAgentContext((await response.json()) as unknown);
}
