// Playtest bot: hunts the nearest catchable player when carrying, flees the
// carrier (and grounded potatoes) otherwise, steers around obstacles. Good
// enough to keep rounds moving — not meant to beat humans.

import { BATATA } from '../../../shared/constants';
import { IDLE_INPUT, type PlayerId, type PlayerInput } from '../../../shared/types';
import { circleHitsRect } from './arena';
import type { BatataMode, BatataPlayer } from './mode';

export interface BotMemory {
  wander: { x: number; y: number } | null;
  rethinkInMs: number;
}

const FLEE_RADIUS = 5;

export function computeBotInput(
  mode: BatataMode,
  pid: PlayerId,
  mem: BotMemory,
  rng: () => number,
): PlayerInput {
  const p = mode.players.get(pid);
  if (!p || !p.alive || p.frozenMs > 0) return { ...IDLE_INPUT };

  const pot = mode.potato;
  let tx: number;
  let ty: number;

  if (pot.holder === pid) {
    const prey = nearestCatchable(mode, p);
    if (!prey) return { ...IDLE_INPUT };
    tx = prey.x;
    ty = prey.y;
    mem.wander = null;
  } else {
    const threat =
      pot.holder !== null
        ? mode.players.get(pot.holder)
        : pot.onGround
          ? pot
          : null;
    const threatD = threat ? Math.hypot(threat.x - p.x, threat.y - p.y) : Infinity;
    if (threat && threatD < FLEE_RADIUS) {
      // Run from the threat, biased toward the center so walls don't trap us.
      const b = mode.bounds;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const away = norm(p.x - threat.x, p.y - threat.y);
      const inward = norm(cx - p.x, cy - p.y);
      const nearWall =
        Math.min(p.x - b.minX, b.maxX - p.x, p.y - b.minY, b.maxY - p.y) < 1.4;
      const bias = nearWall ? 1.2 : 0.25;
      tx = p.x + away.x * 3 + inward.x * bias * 3;
      ty = p.y + away.y * 3 + inward.y * bias * 3;
      mem.wander = null;
    } else {
      mem.rethinkInMs -= 1000 / 30;
      if (!mem.wander || mem.rethinkInMs <= 0 || arrived(p, mem.wander)) {
        mem.rethinkInMs = 1500 + rng() * 1500;
        mem.wander = pickWanderTarget(mode, rng);
      }
      tx = mem.wander.x;
      ty = mem.wander.y;
    }
  }

  const desired = norm(tx - p.x, ty - p.y);
  const dir = steerAroundObstacles(mode, p, desired);
  const input: PlayerInput = { ...IDLE_INPUT };
  if (dir.x < -0.38) input.left = true;
  if (dir.x > 0.38) input.right = true;
  if (dir.y < -0.38) input.up = true;
  if (dir.y > 0.38) input.down = true;
  if (rng() < 0.004) input.ability = true;
  // Panic dodge when the carrier is about to tag us.
  if (pot.holder && pot.holder !== pid && p.dodgeCooldownMs <= 0) {
    const carrier = mode.players.get(pot.holder);
    if (carrier && Math.hypot(carrier.x - p.x, carrier.y - p.y) < 1.3) {
      input.action = true;
    }
  }
  return input;
}

function nearestCatchable(mode: BatataMode, me: BatataPlayer): BatataPlayer | null {
  let best: BatataPlayer | null = null;
  let bestD = Infinity;
  for (const other of mode.players.values()) {
    if (other.id === me.id || !other.alive || other.immuneMs > 0) continue;
    const d = (other.x - me.x) ** 2 + (other.y - me.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best;
}

function pickWanderTarget(mode: BatataMode, rng: () => number): { x: number; y: number } {
  const b = mode.bounds;
  for (let tries = 0; tries < 20; tries++) {
    const x = b.minX + 1 + rng() * (b.maxX - b.minX - 2);
    const y = b.minY + 1 + rng() * (b.maxY - b.minY - 2);
    if (mode.obstacleDistance(x, y) > BATATA.PLAYER_RADIUS) return { x, y };
  }
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Probe a step ahead; when it hits an obstacle, try rotated headings. */
function steerAroundObstacles(
  mode: BatataMode,
  p: BatataPlayer,
  desired: { x: number; y: number },
): { x: number; y: number } {
  const clear = (v: { x: number; y: number }): boolean =>
    !mode.obstacles.some((o) =>
      circleHitsRect(p.x + v.x * 0.7, p.y + v.y * 0.7, BATATA.PLAYER_RADIUS, o),
    );
  if (clear(desired)) return desired;
  for (const angle of [0.7, -0.7, 1.4, -1.4]) {
    const v = rotate(desired, angle);
    if (clear(v)) return v;
  }
  return desired; // stuck — axis-separated movement will slide us along
}

function rotate(v: { x: number; y: number }, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function norm(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function arrived(p: BatataPlayer, target: { x: number; y: number }): boolean {
  return Math.hypot(p.x - target.x, p.y - target.y) < 0.6;
}
