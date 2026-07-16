// Arena generation: classic pillar pattern, destructible block fill with safe
// spawn pockets, and the precomputed sudden-death spiral. Dimensions are per
// round — the arena scales with the player count (see BOMBER.GRID_SIZES).

import { BOMBER } from '../../../shared/constants';

export const enum Cell {
  Floor = 0,
  Solid = 1, // border, pillar or fallen sudden-death wall
  Block = 2, // destructible
}

export const idx = (x: number, y: number, w: number): number => y * w + x;
export const inBounds = (x: number, y: number, w: number, h: number): boolean =>
  x >= 0 && x < w && y >= 0 && y < h;

/** Smallest grid in BOMBER.GRID_SIZES that fits this many players. */
export function gridSizeFor(players: number): { w: number; h: number } {
  for (const size of BOMBER.GRID_SIZES) {
    if (players <= size.maxPlayers) return size;
  }
  return BOMBER.GRID_SIZES[BOMBER.GRID_SIZES.length - 1]!;
}

/** 4 interior corners + 4 edge midpoints + center — 9 spawns (whole roster).
 * The center sits one row below the exact middle, which is a pillar. */
export function spawnsFor(w: number, h: number): { x: number; y: number }[] {
  return [
    { x: 1, y: 1 },
    { x: w - 2, y: 1 },
    { x: w - 2, y: h - 2 },
    { x: 1, y: h - 2 },
    { x: Math.floor(w / 2), y: 1 },
    { x: w - 2, y: Math.floor(h / 2) },
    { x: Math.floor(w / 2), y: h - 2 },
    { x: 1, y: Math.floor(h / 2) },
    { x: Math.floor(w / 2), y: Math.floor(h / 2) + 1 },
  ];
}

const isBorder = (x: number, y: number, w: number, h: number): boolean =>
  x === 0 || y === 0 || x === w - 1 || y === h - 1;
const isPillar = (x: number, y: number, w: number, h: number): boolean =>
  !isBorder(x, y, w, h) && x % 2 === 0 && y % 2 === 0;

/** Fresh grid: borders + pillars + BLOCK_FILL of the rest, spawns kept clear. */
export function generateGrid(w: number, h: number, rng: () => number): Uint8Array {
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isBorder(x, y, w, h) || isPillar(x, y, w, h)) grid[idx(x, y, w)] = Cell.Solid;
    }
  }

  // Spawn pockets: the spawn cell and up to 2 straight cells in each
  // direction stay free, so every spawn has escape lanes.
  const pocket = new Set<number>();
  for (const s of spawnsFor(w, h)) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
      const x = s.x + dx;
      const y = s.y + dy;
      if (inBounds(x, y, w, h)) pocket.add(idx(x, y, w));
    }
  }

  const candidates: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y, w);
      if (grid[i] === Cell.Floor && !pocket.has(i)) candidates.push(i);
    }
  }
  // Fisher–Yates, then fill the first BLOCK_FILL share with blocks.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = a;
  }
  const fill = Math.floor(candidates.length * BOMBER.BLOCK_FILL);
  for (let k = 0; k < fill; k++) grid[candidates[k]!] = Cell.Block;
  return grid;
}

/**
 * Sudden-death fall order: interior cells in a clockwise spiral from the
 * outer ring inward, skipping pillars (they are already solid).
 */
export function spiralOrder(w: number, h: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  let left = 1;
  let top = 1;
  let right = w - 2;
  let bottom = h - 2;
  while (left <= right && top <= bottom) {
    for (let x = left; x <= right; x++) cells.push({ x, y: top });
    for (let y = top + 1; y <= bottom; y++) cells.push({ x: right, y });
    if (top < bottom) for (let x = right - 1; x >= left; x--) cells.push({ x, y: bottom });
    if (left < right) for (let y = bottom - 1; y > top; y--) cells.push({ x: left, y });
    left++;
    top++;
    right--;
    bottom--;
  }
  return cells.filter((c) => !isPillar(c.x, c.y, w, h));
}
