// Contracts shared by client and server. This is the draft from docs/01-fundacao.md;
// it will grow during session 2, but the GameMode boundary must hold.

export type PlayerId = string;

export type AbilityId =
  | 'dash'
  | 'shield'
  | 'teleport'
  | 'freeze'
  | 'push'
  | 'swap'
  | 'ghost'
  | 'decoy'
  | 'bomb-kick';

/**
 * Character art. A single path is the front-facing sprite, flipped
 * horizontally for left/right; the 4-direction map is an optional upgrade
 * that requires no code change. Facing is always also shown by a code-drawn
 * direction marker, since aimed abilities depend on reading it.
 */
export type SpriteRef =
  | string
  | { down: string; up: string; left: string; right: string };

/** One entry of config/personagens.json — a team member. */
export interface CharacterDef {
  id: string;
  nome: string;
  cor: string; // hex — UI accents (name tag, trail, placar)
  /** Art under src/client/public/personagens/ (e.g. "/personagens/carlos.png"). Null → code-drawn placeholder (cor + initial). */
  sprite: SpriteRef | null;
  habilidade: AbilityId;
}

/** Held-key state, sent by the client on keydown/keyup. */
export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Space — mode primary action (bomb in Bomber; ability in Batata). */
  action: boolean;
  /** Shift/E — character ability (Bomber only; Batata maps ability to `action`). */
  ability: boolean;
}

export interface LobbyPlayer {
  id: PlayerId;
  characterId: string | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoundResult {
  /** First eliminated → winner (winner last). */
  placements: PlayerId[];
  /** Mode bonus: kills in Bomber, last-pass "kills" in Batata. */
  bonusPoints: Record<PlayerId, number>;
}

export interface Scoreboard {
  totals: Record<PlayerId, number>;
  perRound: RoundResult[];
}

/**
 * A game mode plugs into the foundation loop. The foundation owns the match
 * flow (lobby, rounds, intermission, scoring); the mode owns one round.
 * All mutation happens inside tick(); snapshot() must return plain data.
 */
export interface GameMode<Snapshot = unknown> {
  readonly id: string;
  startRound(players: PlayerId[]): void;
  tick(dtMs: number, inputs: Map<PlayerId, PlayerInput>): void;
  snapshot(): Snapshot;
  /** Non-null once the round has ended; foundation then scores and moves on. */
  roundResult(): RoundResult | null;
}
