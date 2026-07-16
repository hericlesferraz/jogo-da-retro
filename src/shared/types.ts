// Contracts shared by client and server. The GameMode boundary must hold:
// the foundation owns the match flow, a mode owns what happens inside a round.

export type PlayerId = string;

/** Registered game modes — the host picks one in the lobby. */
export type GameModeId = 'bomber' | 'batata';

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

export type Dir = 'up' | 'down' | 'left' | 'right';

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
  /** Space — mode primary action (bomb in Bomber; dodge in Batata). */
  action: boolean;
  /** Shift/E — character ability (both modes). */
  ability: boolean;
}

export const IDLE_INPUT: PlayerInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  ability: false,
};

// ---------------------------------------------------------------------------
// Match flow (foundation)
// ---------------------------------------------------------------------------

export type MatchPhase =
  | 'lobby'
  | 'countdown'
  | 'playing'
  | 'intermission'
  | 'podium';

/** Picking a character IS being ready — the host starts with whoever chose. */
export interface LobbyPlayer {
  id: PlayerId;
  characterId: string | null;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  /** Joined mid-match — watches, can pick a character for the next match. */
  spectator: boolean;
}

export interface RoundResult {
  /** First eliminated → winner (winner last). */
  placements: PlayerId[];
  /** Mode bonus: kills in Bomber, last-pass "kills" in Batata. */
  bonusPoints: Record<PlayerId, number>;
  /** Kill count (the stat behind bonusPoints — used for display/tiebreak). */
  kills: Record<PlayerId, number>;
  winner: PlayerId | null;
}

export interface ScoreRow {
  playerId: PlayerId;
  characterId: string;
  total: number;
  /** Points earned in the round just finished (placement + bonus). */
  lastRoundDelta: number;
  roundWins: number;
  kills: number;
  /** 1-based position after tiebreaks (ties share the position). */
  rank: number;
}

/**
 * Everything structural a client needs to draw lobby/intermission/podium.
 * Sent on join and whenever it changes — not part of the 15Hz snapshot.
 */
export interface RoomView {
  /** Room code the team types on the title screen to join. */
  code: string;
  phase: MatchPhase;
  /** The game this room plays — chosen at creation, fixed for the room. */
  modeId: GameModeId;
  players: LobbyPlayer[];
  hostId: PlayerId | null;
  roundsPerMatch: number;
  /** 1-based; 0 while in lobby. */
  currentRound: number;
  scoreboard: ScoreRow[];
  lastRound: RoundResult | null;
}

// ---------------------------------------------------------------------------
// Snapshots & events (net tick)
// ---------------------------------------------------------------------------

/** Foundation envelope sent at SNAPSHOT_HZ during countdown/playing. */
export interface GameSnapshot {
  /** Server clock (ms) — the client interpolates against this. */
  t: number;
  phase: MatchPhase;
  /** ms until the round starts; present during countdown. */
  countdownMsLeft?: number;
  mode: ModeSnapshot;
}

/**
 * One-shot happenings, batched per net tick. Every client-side effect
 * (particles, sounds, shakes) is born from an event — presentation is never
 * derived by diffing snapshots.
 */
export type GameEvent =
  | { type: 'bombPlaced'; x: number; y: number; owner: PlayerId }
  | { type: 'explosion'; cells: { x: number; y: number }[]; owner: PlayerId }
  | { type: 'blocksDestroyed'; cells: { x: number; y: number }[] }
  | { type: 'powerupTaken'; x: number; y: number; kind: PowerupKind; player: PlayerId }
  | { type: 'playerDied'; player: PlayerId; killer: PlayerId | null; cause: 'explosion' | 'crush' }
  | { type: 'abilityUsed'; player: PlayerId; ability: AbilityId; x: number; y: number }
  | { type: 'shieldBlocked'; player: PlayerId }
  | { type: 'suddenDeathStarted' }
  | { type: 'wallFell'; x: number; y: number }
  | { type: 'roundEnded'; winner: PlayerId | null }
  // Batata-Quente
  | { type: 'potatoSpawned'; holder: PlayerId }
  | { type: 'potatoPassed'; from: PlayerId; to: PlayerId; x: number; y: number }
  /** Decoy trick: the potato fell to the ground — first to touch it takes it. */
  | { type: 'potatoDropped'; x: number; y: number }
  | { type: 'potatoPicked'; player: PlayerId; x: number; y: number }
  /** victim is null when it blew up on the ground (nobody eliminated). */
  | { type: 'potatoExploded'; x: number; y: number; victim: PlayerId | null }
  | { type: 'dodged'; player: PlayerId; x: number; y: number }
  | { type: 'arenaShrunk'; stage: number };

// ---------------------------------------------------------------------------
// Bomber Royale snapshot
// ---------------------------------------------------------------------------

export type PowerupKind = 'range' | 'bomb' | 'speed';

/** Grid cell chars in BomberSnapshot.grid: row-major gridW × gridH string. */
export const CELL = {
  FLOOR: '.',
  SOLID: '#', // border, pillar or fallen sudden-death wall
  BLOCK: 'X', // destructible
} as const;

export interface BomberPlayerSnap {
  id: PlayerId;
  x: number; // cell units, center of the player
  y: number;
  dir: Dir;
  alive: boolean;
  /** Millis remaining on status effects; 0 when inactive. */
  frozenMs: number;
  ghostMs: number;
  shieldMs: number;
  maxBombs: number;
  range: number;
  speedStacks: number;
  kills: number;
  abilityCooldownMs: number;
}

export interface BomberSnapshot {
  modeId: 'bomber';
  /** Arena dimensions for this round — scale with the player count. */
  gridW: number;
  gridH: number;
  grid: string;
  players: BomberPlayerSnap[];
  bombs: { id: number; x: number; y: number; fuse: number }[]; // fuse: 0..1 left
  flames: { x: number; y: number }[];
  powerups: { x: number; y: number; kind: PowerupKind }[];
  decoys: { id: number; characterId: string; x: number; y: number }[];
  suddenDeath: {
    active: boolean;
    /** ms until it starts (when inactive). */
    startsInMs: number;
    /** Cell about to be crushed, so the client can flash a warning. */
    nextCell: { x: number; y: number } | null;
  };
}

// ---------------------------------------------------------------------------
// Batata-Quente snapshot
// ---------------------------------------------------------------------------

/** Visual arena themes — one is drawn per round (gameplay is identical).
 * The server picks (all clients must agree); the palette lives in the
 * client renderer. */
export const BATATA_THEMES = ['noite', 'cozinha', 'quintal', 'gelo'] as const;
export type BatataTheme = (typeof BATATA_THEMES)[number];

export interface BatataPlayerSnap {
  id: PlayerId;
  x: number; // arena units, center of the player (free movement, not a grid)
  y: number;
  dir: Dir;
  alive: boolean;
  frozenMs: number;
  ghostMs: number;
  shieldMs: number;
  /** Can't receive the potato while > 0 (just passed it / shield block / dodge). */
  immuneMs: number;
  kills: number;
  abilityCooldownMs: number;
  dodgeCooldownMs: number;
}

export interface BatataSnapshot {
  modeId: 'batata';
  /** Visual theme of the current round. */
  theme: BatataTheme;
  players: BatataPlayerSnap[];
  potato: {
    /** null while on the ground or respawning. */
    holder: PlayerId | null;
    /** Where to draw it: the holder's center, or its spot on the ground. */
    x: number;
    y: number;
    onGround: boolean;
    /** Fraction of the fuse burnt (0..1) — drives the blink rate. The total
     * fuse is hidden by design; heat only reveals "getting close". */
    heat: number;
    /** ms until it reappears after an explosion; 0 while active. */
    respawnInMs: number;
  };
  decoys: { id: number; characterId: string; x: number; y: number }[];
  /** Static for the round. */
  obstacles: { x: number; y: number; w: number; h: number }[];
  /** Current playable area — walls close in one step per elimination. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  shrinkStage: number;
}

export type ModeSnapshot = BomberSnapshot | BatataSnapshot;

// ---------------------------------------------------------------------------
// GameMode plugin contract
// ---------------------------------------------------------------------------

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
  /** One-shot events since the last drain (foundation batches them per net tick). */
  drainEvents(): GameEvent[];
}
