import { useEffect } from "react";
import type {
  AgentContextView,
  BrowserAgentContext,
} from "../shared/agent-context.js";
import { rpcCall } from "../shared/rpc-client.js";
import { workspaceParams } from "./workspace-request.js";

interface AgentContextSyncOptions {
  workspaceId?: string | null;
  activeEntryId: string | null;
  view: AgentContextView;
  enabled: boolean;
}

export function useAgentContextSync({
  workspaceId,
  activeEntryId,
  view,
  enabled,
}: AgentContextSyncOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const context: BrowserAgentContext = { activeEntryId, view };
    const syncContext = () => {
      void rpcCall("agentContext.set", {
        ...context,
        ...workspaceParams(workspaceId),
      }).catch(() => undefined);
    };
    syncContext();
    window.addEventListener("focus", syncContext);
    return () => window.removeEventListener("focus", syncContext);
  }, [activeEntryId, enabled, view, workspaceId]);
}
