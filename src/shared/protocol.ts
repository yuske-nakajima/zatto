import type { Entry } from "../server/session.js";

export type ServerMessage =
  | {
      type: "session:update";
      entries: Entry[];
      activeWorkspaceId?: string;
      workspaces?: import("../server/workspace-state.js").WorkspaceSummary[];
    }
  | {
      type: "file:changed";
      id: string;
    };
