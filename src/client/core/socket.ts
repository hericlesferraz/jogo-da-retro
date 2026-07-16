import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

const TOKEN_KEY = 'retro-token';

/** Reconnection identity — the same token lands back in the same seat. */
export function playerToken(): string {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = randomToken();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

/** crypto.randomUUID only exists in secure contexts (https/localhost) —
 * http over a LAN IP still gets a unique id via getRandomValues. */
function randomToken(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Plain connection; entering a room is driven by main.ts (create/join). */
export function connect(): GameSocket {
  return io();
}
