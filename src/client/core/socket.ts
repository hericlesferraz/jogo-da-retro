import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

const TOKEN_KEY = 'retro-token';

/** Reconnection identity — the same token lands back in the same seat. */
export function playerToken(): string {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

/** Plain connection; entering a room is driven by main.ts (create/join). */
export function connect(): GameSocket {
  return io();
}
