// Typed socket.io event maps, shared by client and server.

import type {
  GameEvent,
  GameSnapshot,
  PlayerId,
  PlayerInput,
  RoomView,
} from './types';

export interface JoinPayload {
  /** Reconnection token minted by the client, kept in localStorage. */
  token: string;
}

export interface JoinAck {
  playerId: PlayerId;
  room: RoomView;
}

/** Client → server. */
export interface ClientToServer {
  join: (payload: JoinPayload, ack: (reply: JoinAck) => void) => void;
  'lobby:selectCharacter': (characterId: string | null) => void;
  'lobby:ready': (ready: boolean) => void;
  'lobby:rounds': (rounds: number) => void; // host only
  'lobby:addBot': () => void; // host only
  'lobby:removeBot': (playerId: PlayerId) => void; // host only
  'lobby:start': () => void; // host only
  'podium:playAgain': () => void; // host only — back to lobby, keep characters
  input: (input: PlayerInput) => void;
}

/** Server → client. */
export interface ServerToClient {
  'room:state': (view: RoomView) => void;
  'game:snapshot': (snap: GameSnapshot) => void;
  'game:events': (events: GameEvent[]) => void;
  /** Something the player tried was refused (UI toast). pt-BR text. */
  refused: (message: string) => void;
}
