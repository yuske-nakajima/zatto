import type { Entry } from "../server/session.js";
import type { ReviewStates } from "./review.js";

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
    }
  | { type: "review:update"; entryId: string }
  | ({ type: "review:states" } & ReviewStates)
  | { type: "review:event"; session: string }
  | { type: "viewer:show"; workspaceId: string; entryId: string };
