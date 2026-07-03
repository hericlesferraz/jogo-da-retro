// Playtest bot: flees predicted blasts, drops bombs only when an escape
// exists, wanders toward power-ups/blocks otherwise. Good enough to die
// convincingly — not meant to beat humans.

import { BOMBER } from '../../../shared/constants';
import { IDLE_INPUT, type Dir, type PlayerId, type PlayerInput } from '../../../shared/types';
import { Cell, idx, inBounds } from './grid';
import type { Bomb, BomberMode, BomberPlayer } from './mode';

const { GRID_W: W, GRID_H: H } = BOMBER;
const DIRS: { dir: Dir; x: number; y: number }[] = [
  { dir: 'up', x: 0, y: -1 },
  { dir: 'down', x: 0, y: 1 },
  { dir: 'left', x: -1, y: 0 },
  { dir: 'right', x: 1, y: 0 },
];

export interface BotMemory {
  pathTarget: { x: number; y: number } | null;
  repathInMs: number;
  prevAction: boolean;
  prevAbility: boolean;
}

export function computeBotInput(
  mode: BomberMode,
  pid: PlayerId,
  mem: BotMemory,
  rng: () => number,
): PlayerInput {
  const p = mode.players.get(pid);
  if (!p || !p.alive || p.frozenMs > 0) return { ...IDLE_INPUT };

  const danger = dangerCells(mode);
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  const here = idx(cx, cy);
  const passable = (x: number, y: number): boolean => {
    if (!inBounds(x, y)) return false;
    if (mode.grid[idx(x, y)] !== Cell.Floor) return false;
    const bomb = mode.bombAtCell(x, y);
    return !bomb || bomb.walkThrough.has(pid);
  };

  const input: PlayerInput = { ...IDLE_INPUT };

  // 1) In danger → run to the nearest safe cell (crossing danger if needed).
  if (danger.has(here)) {
    const step = bfsNextStep(cx, cy, passable, (x, y) => !danger.has(idx(x, y)));
    if (step) input[step] = true;
    else {
      const open = DIRS.filter((d) => passable(cx + d.x, cy + d.y));
      const pick = open[Math.floor(rng() * open.length)];
      if (pick) input[pick.dir] = true;
    }
    return input;
  }

  // 2) Occasionally drop a bomb — but only if we can still escape afterwards.
  const worthBombing =
    nextToBlock(mode, cx, cy) || enemyNear(mode, p, 2.5) !== null;
  if (worthBombing && p.bombsActive < p.maxBombs && rng() < 0.08) {
    const withBomb = new Set(danger);
    addBlast(mode, withBomb, cx, cy, p.range);
    const escape = bfsNextStep(cx, cy, passable, (x, y) => !withBomb.has(idx(x, y)));
    if (escape) {
      input.action = true;
      input[escape] = true; // start running immediately
      mem.pathTarget = null;
      return input;
    }
  }

  // 3) Wander: toward the nearest power-up, or a random open cell.
  mem.repathInMs -= 1000 / 30;
  const arrived =
    mem.pathTarget && mem.pathTarget.x === cx && mem.pathTarget.y === cy;
  if (!mem.pathTarget || arrived || mem.repathInMs <= 0) {
    mem.repathInMs = 1500 + rng() * 1500;
    mem.pathTarget = pickTarget(mode, cx, cy, passable, danger, rng);
  }
  if (mem.pathTarget) {
    const target = mem.pathTarget;
    const step = bfsNextStep(
      cx,
      cy,
      (x, y) => passable(x, y) && !danger.has(idx(x, y)),
      (x, y) => x === target.x && y === target.y,
    );
    if (step) input[step] = true;
    else mem.pathTarget = null;
  }

  // 4) Sometimes press the ability button; the cooldown sorts out the rest.
  if (rng() < 0.004) input.ability = true;
  return input;
}

/** Cells currently on fire or inside any bomb's predicted blast. */
function dangerCells(mode: BomberMode): Set<number> {
  const danger = new Set<number>();
  for (const f of mode.flames.keys()) danger.add(f);
  for (const b of mode.bombs.values()) {
    addBlast(mode, danger, Math.floor(b.x), Math.floor(b.y), b.range);
  }
  return danger;
}

function addBlast(mode: BomberMode, into: Set<number>, bx: number, by: number, range: number): void {
  into.add(idx(bx, by));
  for (const d of DIRS) {
    for (let r = 1; r <= range; r++) {
      const x = bx + d.x * r;
      const y = by + d.y * r;
      if (!inBounds(x, y)) break;
      const cell = mode.grid[idx(x, y)];
      if (cell === Cell.Solid) break;
      into.add(idx(x, y));
      if (cell === Cell.Block) break;
    }
  }
}

function nextToBlock(mode: BomberMode, cx: number, cy: number): boolean {
  return DIRS.some(
    (d) => inBounds(cx + d.x, cy + d.y) && mode.grid[idx(cx + d.x, cy + d.y)] === Cell.Block,
  );
}

function enemyNear(mode: BomberMode, p: BomberPlayer, radius: number): BomberPlayer | null {
  for (const other of mode.players.values()) {
    if (other.id === p.id || !other.alive) continue;
    if ((other.x - p.x) ** 2 + (other.y - p.y) ** 2 <= radius * radius) return other;
  }
  return null;
}

function pickTarget(
  mode: BomberMode,
  cx: number,
  cy: number,
  passable: (x: number, y: number) => boolean,
  danger: Set<number>,
  rng: () => number,
): { x: number; y: number } | null {
  const powerups = [...mode.powerups.keys()].map((i) => ({ x: i % W, y: Math.floor(i / W) }));
  if (powerups.length > 0 && rng() < 0.7) {
    powerups.sort((a, b) => dist2(a, cx, cy) - dist2(b, cx, cy));
    return powerups[0]!;
  }
  for (let tries = 0; tries < 20; tries++) {
    const x = 1 + Math.floor(rng() * (W - 2));
    const y = 1 + Math.floor(rng() * (H - 2));
    if (passable(x, y) && !danger.has(idx(x, y))) return { x, y };
  }
  return null;
}

function dist2(c: { x: number; y: number }, x: number, y: number): number {
  return (c.x - x) ** 2 + (c.y - y) ** 2;
}

/** First move of a shortest path from (sx,sy) to any goal cell. */
function bfsNextStep(
  sx: number,
  sy: number,
  passable: (x: number, y: number) => boolean,
  isGoal: (x: number, y: number) => boolean,
): Dir | null {
  if (isGoal(sx, sy)) return null;
  const start = idx(sx, sy);
  const cameFrom = new Map<number, { cell: number; firstDir: Dir }>();
  const queue: number[] = [start];
  cameFrom.set(start, { cell: -1, firstDir: 'up' });
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const x = cur % W;
    const y = Math.floor(cur / W);
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      const ni = idx(nx, ny);
      if (cameFrom.has(ni)) continue;
      // The start cell is always passable (we're standing on it).
      if (!passable(nx, ny)) continue;
      const firstDir = cur === start ? d.dir : cameFrom.get(cur)!.firstDir;
      cameFrom.set(ni, { cell: cur, firstDir });
      if (isGoal(nx, ny)) return firstDir;
      queue.push(ni);
    }
  }
  return null;
}
