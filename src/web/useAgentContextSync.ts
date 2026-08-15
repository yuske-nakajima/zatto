import { useEffect } from "react";
import type {
  AgentContextView,
  BrowserAgentContext,
} from "../shared/agent-context.js";

interface AgentContextSyncOptions {
  activeEntryId: string | null;
  view: AgentContextView;
  enabled: boolean;
}

export function useAgentContextSync({
  activeEntryId,
  view,
  enabled,
}: AgentContextSyncOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const context: BrowserAgentContext = { activeEntryId, view };
    const syncContext = () => {
      void fetch("/api/agent/context", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(context),
      }).catch(() => undefined);
    };
    syncContext();
    window.addEventListener("focus", syncContext);
    return () => window.removeEventListener("focus", syncContext);
  }, [activeEntryId, enabled, view]);
}
