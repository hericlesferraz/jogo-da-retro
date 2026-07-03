import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, JoinAck, ServerToClient } from '../../shared/protocol';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

const TOKEN_KEY = 'retro-token';

function token(): string {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

/**
 * Connects and (re)joins on every connect — reconnection lands the player
 * back in the same seat thanks to the localStorage token.
 */
export function connect(onJoin: (ack: JoinAck) => void): GameSocket {
  const socket: GameSocket = io();
  socket.on('connect', () => {
    socket.emit('join', { token: token() }, onJoin);
  });
  return socket;
}
