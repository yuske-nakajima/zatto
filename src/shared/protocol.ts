import type { Entry } from "../server/session.js";
import type { ReviewRequest } from "./review.js";

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
  | { type: "review:requests"; requests: ReviewRequest[] }
  | { type: "review:completed"; requestId: string };
