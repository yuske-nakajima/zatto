import WebSocket from "ws";
import type { ServerMessage } from "../shared/protocol.js";

/** WebSocket の接続元。`viewer` は Web UI のタブで、CLI の待機は含まない。 */
export type RealtimeClientRole = "viewer" | "other";

export class RealtimeHub {
  private readonly clients = new Map<WebSocket, RealtimeClientRole>();

  add(socket: WebSocket, role: RealtimeClientRole = "other"): void {
    this.clients.set(socket, role);
    socket.once("close", () => {
      this.clients.delete(socket);
    });
  }

  /** 開いている Web UI のタブの数。 */
  viewerCount(): number {
    let count = 0;
    for (const [client, role] of this.clients) {
      if (role === "viewer" && client.readyState === WebSocket.OPEN) count += 1;
    }
    return count;
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
