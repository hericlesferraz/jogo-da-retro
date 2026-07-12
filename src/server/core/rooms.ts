// Room registry: create-with-code / join-by-code, and garbage collection of
// abandoned rooms. The retro flow: one person creates the room on the title
// screen (picking the game), reads the 4-letter code aloud, everyone joins.

import type { Server, Socket } from 'socket.io';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';
import type { GameModeId } from '../../shared/types';
import { Room, type ModeDeps, type ServerMode } from './room';

type IoServer = Server<ClientToServer, ServerToClient>;
type IoSocket = Socket<ClientToServer, ServerToClient>;

/** No lookalikes (0/O, 1/I) — the code is read aloud in a call. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const SWEEP_INTERVAL_MS = 60_000;

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(
    private io: IoServer,
    private createMode: (modeId: GameModeId, deps: ModeDeps) => ServerMode,
  ) {
    setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  handleConnection(socket: IoSocket): void {
    socket.on('room:create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const token = cleanToken(payload?.token);
      if (!token) return;
      const mode = payload?.mode;
      if (mode !== 'bomber' && mode !== 'batata') {
        return ack({ ok: false, error: 'Jogo inválido.' });
      }
      if (socket.data.playerId) {
        return ack({ ok: false, error: 'Recarregue a página para trocar de sala.' });
      }
      const code = this.newCode();
      const room = new Room(this.io, code, mode, this.createMode);
      this.rooms.set(code, room);
      console.log(`Sala ${code} criada (${mode}); salas ativas: ${this.rooms.size}`);
      room.join(socket, token, ack);
    });

    socket.on('room:join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const token = cleanToken(payload?.token);
      if (!token) return;
      if (socket.data.playerId) {
        return ack({ ok: false, error: 'Recarregue a página para trocar de sala.' });
      }
      const code =
        typeof payload?.code === 'string'
          ? payload.code.trim().toUpperCase().slice(0, CODE_LENGTH)
          : '';
      const room = this.rooms.get(code);
      if (!room) {
        return ack({ ok: false, error: 'Sala não encontrada — confira o código.' });
      }
      room.join(socket, token, ack);
    });
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.isAbandoned(now)) {
        room.destroy();
        this.rooms.delete(code);
        console.log(`Sala ${code} abandonada — removida; salas ativas: ${this.rooms.size}`);
      }
    }
  }
}

function cleanToken(token: unknown): string {
  return typeof token === 'string' ? token.slice(0, 64) : '';
}
