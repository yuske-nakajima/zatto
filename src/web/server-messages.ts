import type { ServerMessage } from "../shared/protocol.js";

type Listener = (message: ServerMessage) => void;

const listeners = new Set<Listener>();

/**
 * Subscribes to messages received on the viewer's single WebSocket connection.
 * @param listener - Called for every parsed server message
 * @returns Unsubscribe function
 */
export function subscribeServerMessages(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Delivers a parsed message to every subscriber. */
export function publishServerMessage(message: ServerMessage): void {
  for (const listener of listeners) listener(message);
}
