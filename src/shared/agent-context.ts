export const AGENT_CONTEXT_SCHEMA_VERSION = 1 as const;

export type AgentContextView = "preview" | "search" | "docs";

export interface AgentContext {
  schemaVersion: typeof AGENT_CONTEXT_SCHEMA_VERSION;
  activeFile: string | null;
  openFiles: string[];
  view: AgentContextView;
}

export interface BrowserAgentContext {
  activeEntryId: string | null;
  view: AgentContextView;
}

export function parseAgentContext(value: unknown): AgentContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("zatto サーバーが不正なAgentコンテキストを返しました");
  }
  const candidate = value as Partial<AgentContext>;
  if (
    candidate.schemaVersion !== AGENT_CONTEXT_SCHEMA_VERSION ||
    !isNullableString(candidate.activeFile) ||
    !Array.isArray(candidate.openFiles) ||
    candidate.openFiles.some((file) => typeof file !== "string") ||
    !isAgentContextView(candidate.view)
  ) {
    throw new Error("zatto サーバーが不正なAgentコンテキストを返しました");
  }
  return {
    schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
    activeFile: candidate.activeFile,
    openFiles: [...candidate.openFiles],
    view: candidate.view,
  };
}

export function isAgentContextView(value: unknown): value is AgentContextView {
  return value === "preview" || value === "search" || value === "docs";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
