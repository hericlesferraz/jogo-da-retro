// All gameplay tuning lives here (or in the mode design docs) — never inline.
// Doc values are starting points; when a value changes after playtesting,
// update the design doc too.

export const SERVER_TICK_HZ = 30;
export const SNAPSHOT_HZ = 15;
export const TICK_MS = 1000 / SERVER_TICK_HZ;

export const DEFAULT_ROUNDS_PER_MATCH = 4;
export const MIN_ROUNDS_PER_MATCH = 1;
export const MAX_ROUNDS_PER_MATCH = 8;
export const INTERMISSION_MS = 12_000;
export const COUNTDOWN_MS = 3_000;
/** Grace after the round is decided (last kill animates) before scoring. */
export const ROUND_END_GRACE_MS = 1_200;

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;

/** Client renders this far behind the newest snapshot (interpolation buffer). */
export const INTERP_DELAY_MS = 100;

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
  GRID_W: 17,
  GRID_H: 13,
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
  /** Kicked bombs slide at this speed until they hit something. */
  BOMB_SLIDE_CELLS_PER_S: 8,

  POWERUP_DROP_CHANCE: 0.3,

  SUDDEN_DEATH_AT_MS: 90_000,
  SUDDEN_DEATH_STEP_MS: 500,

  KILL_BONUS_POINTS: 3,
} as const;
