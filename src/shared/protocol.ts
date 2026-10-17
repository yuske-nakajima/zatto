import type { Entry } from "../server/session.js";
import type { ActiveReview, ReviewListener } from "./review.js";

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
  | {
      type: "review:states";
      reviews: ActiveReview[];
      listeners: ReviewListener[];
    }
  | { type: "review:event"; session: string };
