import path from "node:path";
import type { FastifyInstance } from "fastify";
import {
  AGENT_CONTEXT_SCHEMA_VERSION,
  type AgentContext,
  type AgentContextFile,
  type BrowserAgentContext,
  isAgentContextView,
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

export function registerAgentContextRoutes(
  app: FastifyInstance,
  sessionStore: SessionStore,
  contextStore: AgentContextStore,
): void {
  app.get("/api/agent/context", async () => {
    return contextStore.getContext(sessionStore);
  });

  app.put<{ Body: unknown }>("/api/agent/context", async (request, reply) => {
    const context = parseBrowserAgentContext(request.body, sessionStore);
    if (!context) {
      return reply.code(400).send({
        message: "Agentコンテキストには有効なactiveEntryIdとviewが必要です",
      });
    }
    contextStore.setBrowserContext(context);
    return reply.code(204).send();
  });
}

function parseBrowserAgentContext(
  value: unknown,
  sessionStore: SessionStore,
): BrowserAgentContext | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as {
    activeEntryId?: unknown;
    view?: unknown;
  };
  if (
    !isNullableString(candidate.activeEntryId) ||
    !isAgentContextView(candidate.view) ||
    (candidate.activeEntryId !== null &&
      !sessionStore.getEntry(candidate.activeEntryId))
  ) {
    return null;
  }
  return {
    activeEntryId: candidate.activeEntryId,
    view: candidate.view,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
