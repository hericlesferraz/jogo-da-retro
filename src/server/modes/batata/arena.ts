// Open-field arena: spawn ring and scattered obstacles (crates/pillars) with
// enough clearance that every gap fits an escape route — no sealed pockets.

import { BATATA } from '../../../shared/constants';

export interface Rect {
  x: number; // top-left corner, arena units
  y: number;
  w: number;
  h: number;
}

const { ARENA_W: W, ARENA_H: H } = BATATA;

/** Spawn points on an ellipse around the center, clockwise from the top. */
export function spawnPoints(count: number): { x: number; y: number }[] {
  const rx = W / 2 - 1.6;
  const ry = H / 2 - 1.6;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { x: W / 2 + Math.cos(a) * rx, y: H / 2 + Math.sin(a) * ry };
  });
}

/** Candidate obstacle shapes, arena units. */
const SHAPES: { w: number; h: number }[] = [
  { w: 1, h: 1 },
  { w: 2, h: 1 },
  { w: 1, h: 2 },
  { w: 1.5, h: 1.5 },
];

/** Min clearance between obstacles and to walls — always leaves a route. */
const GAP = 1.7;

export function generateObstacles(rng: () => number): Rect[] {
  const out: Rect[] = [];
  const spawns = spawnPoints(8);
  let attempts = 0;
  while (out.length < BATATA.OBSTACLE_COUNT && attempts < 400) {
    attempts += 1;
    const shape = SHAPES[Math.floor(rng() * SHAPES.length)]!;
    const rect: Rect = {
      x: GAP + rng() * (W - shape.w - GAP * 2),
      y: GAP + rng() * (H - shape.h - GAP * 2),
      w: shape.w,
      h: shape.h,
    };
    const crowdsSpawn = spawns.some(
      (s) => pointRectDistance(s.x, s.y, rect) < 0.9,
    );
    const crowdsOther = out.some((o) => rectsOverlap(inflate(rect, GAP), o));
    if (!crowdsSpawn && !crowdsOther) out.push(rect);
  }
  return out;
}

export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Distance from a point to a rect's boundary; 0 when inside. */
export function pointRectDistance(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Circle (player) vs rect overlap. */
export function circleHitsRect(cx: number, cy: number, radius: number, r: Rect): boolean {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < radius * radius;
}
