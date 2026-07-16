// All gameplay tuning lives here (or in the mode design docs) — never inline.
// Doc values are starting points; when a value changes after playtesting,
// update the design doc too.

export const SERVER_TICK_HZ = 30;
/** Every tick — doubles traffic vs 15Hz (still tiny) but shaves ~35ms off
 * perceived input latency, which matters when the server is a continent away. */
export const SNAPSHOT_HZ = 30;
export const TICK_MS = 1000 / SERVER_TICK_HZ;

export const DEFAULT_ROUNDS_PER_MATCH = 4;
export const MIN_ROUNDS_PER_MATCH = 1;
export const MAX_ROUNDS_PER_MATCH = 8;
export const INTERMISSION_MS = 7_000;
export const COUNTDOWN_MS = 3_000;
/** Grace after the round is decided (last kill animates) before scoring. */
export const ROUND_END_GRACE_MS = 1_200;

/** The whole roster can play (character uniqueness is the effective cap). */
export const MAX_PLAYERS = 9;
export const MIN_PLAYERS_TO_START = 2;

/** Client renders this far behind the newest snapshot (interpolation buffer).
 * Must cover the snapshot interval (33ms @ 30Hz) + network jitter; measured
 * ~44ms of jitter to the deploy, so 75ms keeps play smooth while cutting
 * another ~25ms of perceived input latency vs the old 100ms. */
export const INTERP_DELAY_MS = 75;

// ---------------------------------------------------------------------------
// Client audio
// ---------------------------------------------------------------------------

/** Background music volume — low by default: the team plays while on a call. */
export const MUSIC_VOLUME = 0.15;

// ---------------------------------------------------------------------------
// Abilities (foundation)
// ---------------------------------------------------------------------------

export const ABILITY_COOLDOWN_MS = 10_000;
export const FREEZE_DURATION_MS = 1_500;
export const GHOST_DURATION_MS = 2_000;
export const DECOY_DURATION_MS = 4_000;
/** Shield stays armed this long if nothing hits it (doc gives no duration). */
export const SHIELD_DURATION_MS = 5_000;
export const DASH_DURATION_MS = 180;
export const DASH_SPEED_CELLS_PER_S = 16;
export const TELEPORT_RANGE_CELLS = 3;
export const PUSH_DISTANCE_CELLS = 3;
export const PUSH_SPEED_CELLS_PER_S = 14;
/** freeze/push pick the nearest enemy within this radius (cells). */
export const TARGETED_ABILITY_RADIUS_CELLS = 7;

// ---------------------------------------------------------------------------
// Bomber Royale
// ---------------------------------------------------------------------------

export const BOMBER = {
  /** Classic size — also the fallback/default before the first snapshot. */
  GRID_W: 17,
  GRID_H: 13,
  /** The arena scales with the crowd (playtest: 9 players spawned almost on
   * top of each other in 17×13). Odd sizes only — border + pillar lattice. */
  GRID_SIZES: [
    { maxPlayers: 4, w: 17, h: 13 },
    { maxPlayers: 6, w: 19, h: 13 },
    { maxPlayers: 9, w: 21, h: 15 },
  ],
  /** Fraction of free interior cells filled with destructible blocks. */
  BLOCK_FILL: 0.55,

  /** Base move speed, cells/second. */
  BASE_SPEED: 4.2,
  SPEED_UP_STEP: 0.15, // +15% per boot
  SPEED_UP_MAX_STACKS: 4, // max +60%
  /** Player collision radius in cells (slightly under half a cell). */
  PLAYER_RADIUS: 0.38,
  /**
   * Corner assist: when blocked, if the player's offset toward an open
   * neighbouring lane is at least this fraction of a cell, slide them around
   * the corner instead of stopping dead.
   */
  CORNER_CUT_THRESHOLD: 0.1,

  BOMB_FUSE_MS: 2_500,
  BASE_RANGE: 2,
  RANGE_MAX: 6,
  BASE_BOMBS: 1,
  BOMBS_MAX: 5,
  FLAME_MS: 500,
  /** Flames stop killing this long before they fade. The client renders
   * ~INTERP_DELAY_MS in the past, so without this a player walking toward
   * a dying flame dies to fire they never saw themselves touch. */
  FLAME_HARMLESS_TAIL_MS: 150,
  /** Kicked bombs slide at this speed until they hit something. */
  BOMB_SLIDE_CELLS_PER_S: 8,

  POWERUP_DROP_CHANCE: 0.3,

  SUDDEN_DEATH_AT_MS: 90_000,
  SUDDEN_DEATH_STEP_MS: 500,

  KILL_BONUS_POINTS: 3,
} as const;

// ---------------------------------------------------------------------------
// Batata-Quente
// ---------------------------------------------------------------------------

export const BATATA = {
  /** Arena in cell units — free movement; cells only set the render scale. */
  ARENA_W: 20,
  ARENA_H: 13,
  PLAYER_RADIUS: 0.35,
  /** Base move speed, cells/second. */
  BASE_SPEED: 4.4,
  /** Carrier moves faster, or they would never catch anyone (doc: +15%). */
  CARRIER_SPEED_BONUS: 0.15,
  /** Immunity after passing (or shield-blocking) — kills the instant pass-back. */
  PASS_IMMUNITY_MS: 1_500,
  /** Center-to-center pass distance — generous on purpose ("eu não encostei!"). */
  TOUCH_RADIUS: 0.85,
  /** Hidden semi-random fuse. */
  FUSE_MIN_MS: 15_000,
  FUSE_MAX_MS: 25_000,
  /** The potato reappears with a random survivor after an explosion. */
  RESPAWN_MS: 2_000,
  /** A grounded potato (decoy trick) sticks to the nearest player after this. */
  GROUND_PICKUP_TIMEOUT_MS: 4_000,
  /** Dodge (espaço): timed escape that compensates the carrier's edge —
   * brief pass-immunity + a small burst away. Mistimed = wasted cooldown. */
  DODGE_IMMUNITY_MS: 500,
  DODGE_BURST_MS: 250,
  DODGE_SPEED_CELLS_PER_S: 8,
  DODGE_COOLDOWN_MS: 4_000,
  /** Anti-camping: no pass for this long → carrier speed ramps up. */
  ANTICAMP_AFTER_MS: 10_000,
  ANTICAMP_RAMP_PER_S: 0.05,
  ANTICAMP_MAX_BONUS: 1.0,
  /** Walls close one step per elimination, with steps sized by the player
   * count so the LAST duel always happens in this box — with a fixed step,
   * 9 players squeezed the final 1v1 into nothing (playtest feedback). */
  FINAL_ARENA_W: 8,
  FINAL_ARENA_H: 6,
  /** How fast the walls slide to their new position, units/second. */
  SHRINK_SPEED: 2.0,
  OBSTACLE_COUNT: 9,
  KILL_BONUS_POINTS: 2,
} as const;
