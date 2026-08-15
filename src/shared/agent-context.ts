export const AGENT_CONTEXT_SCHEMA_VERSION = 1 as const;

export type AgentContextView = "preview" | "search" | "docs";

export interface AgentContextFile {
  title: string;
  path: string;
}

export interface AgentContext {
  schemaVersion: typeof AGENT_CONTEXT_SCHEMA_VERSION;
  activeFile: AgentContextFile | null;
  openFiles: AgentContextFile[];
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
    (candidate.activeFile !== null &&
      !isAgentContextFile(candidate.activeFile)) ||
    !Array.isArray(candidate.openFiles) ||
    candidate.openFiles.some((file) => !isAgentContextFile(file)) ||
    !isAgentContextView(candidate.view)
  ) {
    throw new Error("zatto サーバーが不正なAgentコンテキストを返しました");
  }
  return {
    schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
    activeFile: candidate.activeFile ? { ...candidate.activeFile } : null,
    openFiles: candidate.openFiles.map((file) => ({ ...file })),
    view: candidate.view,
  };
}

export function isAgentContextView(value: unknown): value is AgentContextView {
  return value === "preview" || value === "search" || value === "docs";
}

function isAgentContextFile(value: unknown): value is AgentContextFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const file = value as Partial<AgentContextFile>;
  return (
    typeof file.title === "string" &&
    file.title.length > 0 &&
    typeof file.path === "string" &&
    file.path.length > 0
  );
}
