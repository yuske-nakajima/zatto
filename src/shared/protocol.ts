import type { Entry } from "../server/session.js";

export type ServerMessage =
  | {
      type: "session:update";
      entries: Entry[];
    }
  | {
      type: "file:changed";
      id: string;
    };
