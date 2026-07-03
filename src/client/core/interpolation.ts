// Snapshot buffer: the client renders ~INTERP_DELAY_MS in the past,
// blending entity positions between the two snapshots around that instant.

import { INTERP_DELAY_MS } from '../../shared/constants';
import type { BomberSnapshot, GameSnapshot } from '../../shared/types';

interface Entry {
  snap: GameSnapshot;
  recvAt: number;
}

/** Entities jumping further than this are teleports — snap, don't glide. */
const TELEPORT_DIST = 1.5;

export class SnapshotBuffer {
  private entries: Entry[] = [];

  push(snap: GameSnapshot): void {
    this.entries.push({ snap, recvAt: performance.now() });
    if (this.entries.length > 30) this.entries.shift();
  }

  latest(): GameSnapshot | null {
    return this.entries[this.entries.length - 1]?.snap ?? null;
  }

  clear(): void {
    this.entries = [];
  }

  /** Interpolated mode snapshot for rendering (null before 2 snapshots). */
  sample(): BomberSnapshot | null {
    const n = this.entries.length;
    if (n === 0) return null;
    if (n === 1) return this.entries[0]!.snap.mode;
    const renderAt = performance.now() - INTERP_DELAY_MS;

    let a = this.entries[0]!;
    let b = this.entries[n - 1]!;
    for (let i = n - 1; i > 0; i--) {
      if (this.entries[i - 1]!.recvAt <= renderAt) {
        a = this.entries[i - 1]!;
        b = this.entries[i]!;
        break;
      }
    }
    if (renderAt >= b.recvAt) return b.snap.mode; // fell behind — show newest
    const span = b.recvAt - a.recvAt;
    const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (renderAt - a.recvAt) / span));
    return blend(a.snap.mode, b.snap.mode, t);
  }
}

function blend(a: BomberSnapshot, b: BomberSnapshot, t: number): BomberSnapshot {
  const oldPlayers = new Map(a.players.map((p) => [p.id, p]));
  const oldBombs = new Map(a.bombs.map((x) => [x.id, x]));
  const oldDecoys = new Map(a.decoys.map((d) => [d.id, d]));
  return {
    ...b,
    players: b.players.map((p) => {
      const prev = oldPlayers.get(p.id);
      if (!prev || !p.alive) return p;
      if (Math.hypot(p.x - prev.x, p.y - prev.y) > TELEPORT_DIST) return p;
      return { ...p, x: lerp(prev.x, p.x, t), y: lerp(prev.y, p.y, t) };
    }),
    bombs: b.bombs.map((bomb) => {
      const prev = oldBombs.get(bomb.id);
      if (!prev) return bomb;
      return { ...bomb, x: lerp(prev.x, bomb.x, t), y: lerp(prev.y, bomb.y, t) };
    }),
    decoys: b.decoys.map((d) => {
      const prev = oldDecoys.get(d.id);
      if (!prev) return d;
      return { ...d, x: lerp(prev.x, d.x, t), y: lerp(prev.y, d.y, t) };
    }),
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
