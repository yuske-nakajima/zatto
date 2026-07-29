import WebSocket from "ws";
import type { ServerMessage } from "../shared/protocol.js";

export class RealtimeHub {
  private readonly clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
    socket.once("close", () => {
      this.clients.delete(socket);
    });
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
