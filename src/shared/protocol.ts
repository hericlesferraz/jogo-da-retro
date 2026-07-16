// Typed socket.io event maps, shared by client and server.

import type {
  GameEvent,
  GameModeId,
  GameSnapshot,
  PlayerId,
  PlayerInput,
  RoomView,
} from './types';

export interface CreateRoomPayload {
  /** Reconnection token minted by the client, kept in localStorage. */
  token: string;
  /** The game this room plays — picked on the title screen, fixed for the room. */
  mode: GameModeId;
}

export interface JoinRoomPayload {
  token: string;
  /** Room code (4 letters) shared by the creator. */
  code: string;
}

export type RoomReply =
  | { ok: true; playerId: PlayerId; room: RoomView }
  | { ok: false; error: string }; // pt-BR, shown as a toast

/** Client → server. */
export interface ClientToServer {
  'room:create': (payload: CreateRoomPayload, ack: (reply: RoomReply) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (reply: RoomReply) => void) => void;
  'lobby:selectCharacter': (characterId: string | null) => void;
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
