import WebSocket from "ws";
import type { ServerMessage } from "../shared/protocol.js";
import { remoteMessage } from "./remote-view.js";

/**
 * WebSocket の接続元。
 * `viewer` は Mac の Web UI のタブ、`remote` は外の端末のタブで、`other` は CLI の待機などを指す。
 */
export type RealtimeClientRole = "viewer" | "remote" | "other";

export class RealtimeHub {
  private readonly clients = new Map<WebSocket, RealtimeClientRole>();

  add(socket: WebSocket, role: RealtimeClientRole = "other"): void {
    this.clients.set(socket, role);
    socket.once("close", () => {
      this.clients.delete(socket);
    });
  }

  /** 開いている Mac の Web UI のタブの数。外の端末のタブは数えない。 */
  viewerCount(): number {
    let count = 0;
    for (const [client, role] of this.clients) {
      if (role === "viewer" && client.readyState === WebSocket.OPEN) count += 1;
    }
    return count;
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    const remote = remoteMessage(message);
    const remotePayload = remote ? JSON.stringify(remote) : null;
    for (const [client, role] of this.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (role !== "remote") client.send(payload);
      else if (remotePayload) client.send(remotePayload);
    }
  }
}
