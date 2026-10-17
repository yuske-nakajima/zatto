import path from "node:path";
import {
  AGENT_CONTEXT_SCHEMA_VERSION,
  type AgentContext,
  type AgentContextFile,
  type BrowserAgentContext,
  normalizeAgentContextTitle,
} from "../shared/agent-context.js";
import type { SessionStore } from "./session.js";

export class AgentContextStore {
  private browserContext: BrowserAgentContext = {
    activeEntryId: null,
    view: "preview",
  };

  setBrowserContext(context: BrowserAgentContext): void {
    this.browserContext = { ...context };
  }

  getContext(sessionStore: SessionStore): AgentContext {
    const session = sessionStore.getSession();
    const activeEntry = this.browserContext.activeEntryId
      ? session.entries.find(
          ({ id }) => id === this.browserContext.activeEntryId,
        )
      : undefined;
    return {
      schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
      activeFile: activeEntry ? contextFile(activeEntry) : null,
      openFiles: session.entries.map(contextFile),
      view: this.browserContext.view,
    };
  }
}

function contextFile(entry: {
  title: string;
  absPath: string;
}): AgentContextFile {
  const title = normalizeAgentContextTitle(entry.title);
  const fallbackTitle = normalizeAgentContextTitle(
    path.basename(entry.absPath),
  );
  return {
    title: title || fallbackTitle || "(untitled)",
    path: entry.absPath,
  };
}
