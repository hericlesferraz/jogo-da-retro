// Bomber Royale — authoritative round logic. Everything (movement, chains,
// deaths) is resolved per cell on the server; the client only renders.

import { AbilitySystem, type AbilityHost } from '../../core/abilities';
import type { ModeDeps, ServerMode } from '../../core/room';
import {
  BOMBER,
  DASH_DURATION_MS,
  DASH_SPEED_CELLS_PER_S,
  DECOY_DURATION_MS,
  PUSH_DISTANCE_CELLS,
  PUSH_SPEED_CELLS_PER_S,
  ROUND_END_GRACE_MS,
  TELEPORT_RANGE_CELLS,
} from '../../../shared/constants';
import {
  CELL,
  type AbilityId,
  type BomberPlayerSnap,
  type BomberSnapshot,
  type Dir,
  type GameEvent,
  type PlayerId,
  type PlayerInput,
  type RoundResult,
} from '../../../shared/types';
import { Cell, generateGrid, idx, inBounds, SPAWNS, spiralOrder } from './grid';
import { computeBotInput, type BotMemory } from './bot';

const { GRID_W: W, GRID_H: H } = BOMBER;
const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface BomberPlayer {
  id: PlayerId;
  x: number; // center, cell units
  y: number;
  dir: Dir;
  alive: boolean;
  frozenMs: number;
  ghostMs: number;
  shieldMs: number;
  /** Brief immunity right after a shield blocks a blast. */
  immuneMs: number;
  dashMs: number;
  dashDir: Dir;
  /** Forced knockback from `push`: remaining distance in cells. */
  knockCells: number;
  knockDir: Dir;
  maxBombs: number;
  range: number;
  speedStacks: number;
  bombsActive: number;
  kills: number;
  prevAction: boolean;
  prevAbility: boolean;
  /** Rising-edge order of held direction keys — latest press wins. */
  pressSeq: Record<Dir, number>;
  prevHeld: Record<Dir, boolean>;
}

export interface Bomb {
  id: number;
  owner: PlayerId;
  x: number; // center; floats while sliding from a kick
  y: number;
  fuseMs: number;
  range: number;
  slideDir: Dir | null;
  /** Players allowed to walk off/through it (were on the cell when it landed). */
  walkThrough: Set<PlayerId>;
}

interface Flame {
  owner: PlayerId;
  expiresMs: number;
}

export class BomberMode implements ServerMode, AbilityHost {
  readonly id = 'bomber';

  grid: Uint8Array = new Uint8Array(W * H);
  players = new Map<PlayerId, BomberPlayer>();
  bombs = new Map<number, Bomb>();
  flames = new Map<number, Flame>(); // key: cell idx
  powerups = new Map<number, 'range' | 'bomb' | 'speed'>();
  private pendingPowerups = new Map<number, 'range' | 'bomb' | 'speed'>();
  decoys: { id: number; owner: PlayerId; characterId: string; x: number; y: number; msLeft: number }[] = [];

  private events: GameEvent[] = [];
  private elimOrder: PlayerId[] = [];
  private result: RoundResult | null = null;
  /** Once decided (≤1 alive), the world can no longer kill anyone. */
  private decidedAtMs: number | null = null;
  private elapsedMs = 0;
  private nextBombId = 1;
  private nextDecoyId = 1;
  private pressCounter = 1;

  private spiral = spiralOrder();
  private spiralIdx = 0;
  private suddenDeathOn = false;
  private nextFallMs = 0;

  private abilities: AbilitySystem;
  private botMemory = new Map<PlayerId, BotMemory>();

  constructor(
    private deps: ModeDeps,
    private rng: () => number = Math.random,
  ) {
    this.abilities = new AbilitySystem(
      this,
      (pid) => this.deps.abilityOf(pid),
      (ev) => this.events.push(ev),
      this.rng,
    );
  }

  // ------------------------------------------------------------ round setup

  startRound(playerIds: PlayerId[]): void {
    this.grid = generateGrid(this.rng);
    this.players.clear();
    this.bombs.clear();
    this.flames.clear();
    this.powerups.clear();
    this.pendingPowerups.clear();
    this.decoys = [];
    this.events = [];
    this.elimOrder = [];
    this.result = null;
    this.decidedAtMs = null;
    this.elapsedMs = 0;
    this.spiralIdx = 0;
    this.suddenDeathOn = false;
    this.nextFallMs = 0;
    this.abilities.resetAll();
    this.botMemory.clear();

    playerIds.slice(0, SPAWNS.length).forEach((pid, i) => {
      const spawn = SPAWNS[i]!;
      this.players.set(pid, {
        id: pid,
        x: spawn.x + 0.5,
        y: spawn.y + 0.5,
        dir: 'down',
        alive: true,
        frozenMs: 0,
        ghostMs: 0,
        shieldMs: 0,
        immuneMs: 0,
        dashMs: 0,
        dashDir: 'down',
        knockCells: 0,
        knockDir: 'down',
        maxBombs: BOMBER.BASE_BOMBS,
        range: BOMBER.BASE_RANGE,
        speedStacks: 0,
        bombsActive: 0,
        kills: 0,
        prevAction: false,
        prevAbility: false,
        pressSeq: { up: 0, down: 0, left: 0, right: 0 },
        prevHeld: { up: false, down: false, left: false, right: false },
      });
    });
  }

  // ------------------------------------------------------------------- tick

  tick(dtMs: number, inputs: Map<PlayerId, PlayerInput>): void {
    if (this.result) return;
    this.elapsedMs += dtMs;
    this.abilities.tick(dtMs);

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.frozenMs = Math.max(0, p.frozenMs - dtMs);
      p.shieldMs = Math.max(0, p.shieldMs - dtMs);
      p.immuneMs = Math.max(0, p.immuneMs - dtMs);
      p.dashMs = Math.max(0, p.dashMs - dtMs);
      if (p.ghostMs > 0) {
        p.ghostMs = Math.max(0, p.ghostMs - dtMs);
        // Ghost ran out inside a block → crushed (documented risk/reward).
        if (p.ghostMs === 0 && this.cellAt(p.x, p.y) === Cell.Block) {
          this.kill(p, null, 'crush');
        }
      }
    }

    for (const [pid, input] of inputs) {
      const p = this.players.get(pid);
      if (!p || !p.alive) continue;
      this.trackPresses(p, input);
      const abilityEdge = input.ability && !p.prevAbility;
      const actionEdge = input.action && !p.prevAction;
      p.prevAbility = input.ability;
      p.prevAction = input.action;
      if (p.frozenMs > 0) continue;
      if (abilityEdge) this.abilities.tryUse(pid);
      if (actionEdge) this.placeBomb(p);
      this.movePlayer(p, input, dtMs);
    }

    this.tickBombs(dtMs);
    this.tickFlames(dtMs);
    this.tickDecoys(dtMs);
    this.tickSuddenDeath(dtMs);
    this.checkFlameDeaths();
    this.checkPickupsAndEscapes();
    this.checkRoundEnd(dtMs);
  }

  // -------------------------------------------------------------- movement

  private trackPresses(p: BomberPlayer, input: PlayerInput): void {
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      if (input[dir] && !p.prevHeld[dir]) p.pressSeq[dir] = this.pressCounter++;
      p.prevHeld[dir] = input[dir];
    }
  }

  private speedOf(p: BomberPlayer): number {
    return BOMBER.BASE_SPEED * (1 + BOMBER.SPEED_UP_STEP * p.speedStacks);
  }

  private movePlayer(p: BomberPlayer, input: PlayerInput, dtMs: number): void {
    const dt = dtMs / 1000;

    if (p.knockCells > 0) {
      const step = Math.min(p.knockCells, PUSH_SPEED_CELLS_PER_S * dt);
      const moved = this.slide(p, p.knockDir, step);
      p.knockCells = moved < step * 0.5 ? 0 : p.knockCells - moved;
      if (p.knockCells <= 0) this.allowBombEscape(p);
      return;
    }
    if (p.dashMs > 0) {
      this.slide(p, p.dashDir, DASH_SPEED_CELLS_PER_S * dt);
      p.dir = p.dashDir;
      return;
    }

    const held = (['up', 'down', 'left', 'right'] as const).filter((d) => input[d]);
    if (held.length === 0) return;
    held.sort((a, b) => p.pressSeq[b] - p.pressSeq[a]); // latest press first
    const dist = this.speedOf(p) * dt;
    for (const dir of held) {
      if (this.slide(p, dir, dist) > 0) {
        p.dir = dir;
        return;
      }
    }
    p.dir = held[0]!; // face the wall even when stuck
  }

  /**
   * Grid movement with funnel + corner assist. The player's center is the
   * authoritative point: it can only cross into a cell that is passable, and
   * while moving it is funnelled toward the lane center — the classic
   * "deslize" that makes corridors feel good.
   * Returns the distance actually moved along the main axis (or via assist).
   */
  private slide(p: BomberPlayer, dir: Dir, dist: number): number {
    const v = DIR_VEC[dir];
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const ahead = { x: cx + v.x, y: cy + v.y };
    const horizontal = v.x !== 0;

    if (this.passable(ahead.x, ahead.y, p)) {
      // Advance, funnelling the perpendicular offset toward the lane center.
      if (horizontal) {
        p.x += v.x * dist;
        p.y = approach(p.y, cy + 0.5, dist);
      } else {
        p.y += v.y * dist;
        p.x = approach(p.x, cx + 0.5, dist);
      }
      return dist;
    }

    // Blocked ahead: press flush against the wall…
    const limit = horizontal
      ? v.x > 0
        ? ahead.x - BOMBER.PLAYER_RADIUS
        : ahead.x + 1 + BOMBER.PLAYER_RADIUS
      : v.y > 0
        ? ahead.y - BOMBER.PLAYER_RADIUS
        : ahead.y + 1 + BOMBER.PLAYER_RADIUS;
    let moved = 0;
    if (horizontal) {
      const nx = v.x > 0 ? Math.min(p.x + dist, limit) : Math.max(p.x - dist, limit);
      moved = Math.abs(nx - p.x);
      p.x = nx;
    } else {
      const ny = v.y > 0 ? Math.min(p.y + dist, limit) : Math.max(p.y - dist, limit);
      moved = Math.abs(ny - p.y);
      p.y = ny;
    }
    if (moved > 1e-6) return moved;

    // …then corner assist: if the diagonal neighbour is open and the player
    // is already leaning that way, slide them around the corner.
    const offset = horizontal ? p.y - (cy + 0.5) : p.x - (cx + 0.5);
    if (Math.abs(offset) < BOMBER.CORNER_CUT_THRESHOLD) return 0;
    const side = offset > 0 ? 1 : -1;
    const sideCell = horizontal
      ? { x: cx, y: cy + side }
      : { x: cx + side, y: cy };
    const diagonal = { x: sideCell.x + v.x, y: sideCell.y + v.y };
    if (this.passable(sideCell.x, sideCell.y, p) && this.passable(diagonal.x, diagonal.y, p)) {
      if (horizontal) p.y += side * dist;
      else p.x += side * dist;
      return dist;
    }
    return 0;
  }

  /** Can the player's center enter this cell? */
  private passable(x: number, y: number, p: BomberPlayer): boolean {
    if (!inBounds(x, y)) return false;
    const cell = this.grid[idx(x, y)];
    if (cell === Cell.Solid) return false;
    if (cell === Cell.Block && p.ghostMs <= 0) return false;
    const bomb = this.bombAtCell(x, y);
    if (bomb && !bomb.walkThrough.has(p.id)) return false;
    return true;
  }

  bombAtCell(x: number, y: number): Bomb | null {
    for (const b of this.bombs.values()) {
      if (Math.floor(b.x) === x && Math.floor(b.y) === y) return b;
    }
    return null;
  }

  private cellAt(x: number, y: number): Cell {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    return inBounds(cx, cy) ? (this.grid[idx(cx, cy)] as Cell) : Cell.Solid;
  }

  /** After a forced reposition, let the player walk off any bomb under them. */
  private allowBombEscape(p: BomberPlayer): void {
    const bomb = this.bombAtCell(Math.floor(p.x), Math.floor(p.y));
    bomb?.walkThrough.add(p.id);
  }

  // ------------------------------------------------------------------ bombs

  private placeBomb(p: BomberPlayer): void {
    if (p.bombsActive >= p.maxBombs) return;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    if (this.grid[idx(cx, cy)] !== Cell.Floor) return; // no bombs inside blocks (ghost)
    if (this.bombAtCell(cx, cy)) return;
    const walkThrough = new Set<PlayerId>();
    for (const other of this.players.values()) {
      if (other.alive && Math.floor(other.x) === cx && Math.floor(other.y) === cy) {
        walkThrough.add(other.id);
      }
    }
    this.bombs.set(this.nextBombId, {
      id: this.nextBombId++,
      owner: p.id,
      x: cx + 0.5,
      y: cy + 0.5,
      fuseMs: BOMBER.BOMB_FUSE_MS,
      range: p.range,
      slideDir: null,
      walkThrough,
    });
    p.bombsActive += 1;
    this.events.push({ type: 'bombPlaced', x: cx, y: cy, owner: p.id });
  }

  private tickBombs(dtMs: number): void {
    const toDetonate: number[] = [];
    for (const b of this.bombs.values()) {
      if (b.slideDir) this.slideBomb(b, dtMs);
      b.fuseMs -= dtMs;
      if (b.fuseMs <= 0) toDetonate.push(b.id);
      else if (this.flames.has(idx(Math.floor(b.x), Math.floor(b.y)))) {
        toDetonate.push(b.id); // slid into a lingering flame
      }
    }
    for (const id of toDetonate) this.detonate(id);
  }

  private slideBomb(b: Bomb, dtMs: number): void {
    const v = DIR_VEC[b.slideDir!];
    let remaining = (BOMBER.BOMB_SLIDE_CELLS_PER_S * dtMs) / 1000;
    while (remaining > 0) {
      const cx = Math.floor(b.x);
      const cy = Math.floor(b.y);
      const centerX = cx + 0.5;
      const centerY = cy + 0.5;
      // Distance to the center of the next cell along the slide.
      const toNext = v.x !== 0 ? (centerX + v.x - b.x) * v.x : (centerY + v.y - b.y) * v.y;
      const nx = cx + v.x;
      const ny = cy + v.y;
      const blocked =
        !inBounds(nx, ny) ||
        this.grid[idx(nx, ny)] !== Cell.Floor ||
        this.bombAtCellExcept(nx, ny, b.id) !== null ||
        this.playerAtCell(nx, ny) !== null;
      if (blocked) {
        // Settle at the center of the current cell.
        const toCenter = v.x !== 0 ? (centerX - b.x) * v.x : (centerY - b.y) * v.y;
        if (toCenter > 0) {
          const step = Math.min(remaining, toCenter);
          b.x += v.x * step;
          b.y += v.y * step;
        }
        if (toCenter <= remaining) b.slideDir = null;
        return;
      }
      const step = Math.min(remaining, toNext);
      b.x += v.x * step;
      b.y += v.y * step;
      remaining -= step;
    }
  }

  private bombAtCellExcept(x: number, y: number, exceptId: number): Bomb | null {
    const b = this.bombAtCell(x, y);
    return b && b.id !== exceptId ? b : null;
  }

  private playerAtCell(x: number, y: number): BomberPlayer | null {
    for (const p of this.players.values()) {
      if (p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y) return p;
    }
    return null;
  }

  /** Chain-resolving detonation: bombs caught in a blast go off immediately. */
  private detonate(bombId: number): void {
    const first = this.bombs.get(bombId);
    if (!first) return;
    const queue = [first];
    this.bombs.delete(bombId);
    const destroyedBlocks: { x: number; y: number }[] = [];

    while (queue.length > 0) {
      const bomb = queue.pop()!;
      const owner = this.players.get(bomb.owner);
      if (owner && owner.bombsActive > 0) owner.bombsActive -= 1;
      const bx = Math.floor(bomb.x);
      const by = Math.floor(bomb.y);
      const cells: { x: number; y: number }[] = [{ x: bx, y: by }];

      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const v = DIR_VEC[dir];
        for (let d = 1; d <= bomb.range; d++) {
          const x = bx + v.x * d;
          const y = by + v.y * d;
          if (!inBounds(x, y)) break;
          const cell = this.grid[idx(x, y)];
          if (cell === Cell.Solid) break;
          if (cell === Cell.Block) {
            this.grid[idx(x, y)] = Cell.Floor;
            destroyedBlocks.push({ x, y });
            cells.push({ x, y });
            if (this.rng() < BOMBER.POWERUP_DROP_CHANCE) {
              const kinds = ['range', 'bomb', 'speed'] as const;
              this.pendingPowerups.set(idx(x, y), kinds[Math.floor(this.rng() * 3)]!);
            }
            break; // blocks stop the blast
          }
          cells.push({ x, y });
          const chained = this.bombAtCell(x, y);
          if (chained) {
            this.bombs.delete(chained.id);
            queue.push(chained);
            break; // the chained bomb's own rays continue the blast
          }
        }
      }

      for (const c of cells) {
        const i = idx(c.x, c.y);
        this.powerups.delete(i); // exposed power-ups burn
        if (!this.flames.has(i)) {
          this.flames.set(i, { owner: bomb.owner, expiresMs: BOMBER.FLAME_MS });
        } else {
          this.flames.get(i)!.expiresMs = BOMBER.FLAME_MS; // refresh
        }
      }
      this.events.push({ type: 'explosion', cells, owner: bomb.owner });
    }

    if (destroyedBlocks.length > 0) {
      this.events.push({ type: 'blocksDestroyed', cells: destroyedBlocks });
    }
  }

  private tickFlames(dtMs: number): void {
    for (const [i, flame] of this.flames) {
      flame.expiresMs -= dtMs;
      if (flame.expiresMs <= 0) this.flames.delete(i);
    }
    // Reveal pending power-ups once their cell is clear of fire.
    for (const [i, kind] of this.pendingPowerups) {
      if (this.flames.has(i)) continue;
      this.pendingPowerups.delete(i);
      if (this.grid[i] === Cell.Floor) this.powerups.set(i, kind);
    }
  }

  private tickDecoys(dtMs: number): void {
    this.decoys = this.decoys.filter((d) => {
      d.msLeft -= dtMs;
      if (d.msLeft <= 0) return false;
      if (this.flames.has(idx(Math.floor(d.x), Math.floor(d.y)))) return false; // burned
      return true;
    });
  }

  // ----------------------------------------------------------- sudden death

  private tickSuddenDeath(dtMs: number): void {
    if (this.elapsedMs < BOMBER.SUDDEN_DEATH_AT_MS) return;
    if (!this.suddenDeathOn) {
      this.suddenDeathOn = true;
      this.nextFallMs = 0;
      this.events.push({ type: 'suddenDeathStarted' });
    }
    this.nextFallMs -= dtMs;
    while (this.nextFallMs <= 0 && this.spiralIdx < this.spiral.length) {
      const { x, y } = this.spiral[this.spiralIdx++]!;
      const i = idx(x, y);
      this.grid[i] = Cell.Solid;
      this.powerups.delete(i);
      this.pendingPowerups.delete(i);
      this.flames.delete(i);
      const bomb = this.bombAtCell(x, y);
      if (bomb) {
        this.bombs.delete(bomb.id);
        const owner = this.players.get(bomb.owner);
        if (owner && owner.bombsActive > 0) owner.bombsActive -= 1;
      }
      this.decoys = this.decoys.filter(
        (d) => Math.floor(d.x) !== x || Math.floor(d.y) !== y,
      );
      for (const p of this.players.values()) {
        if (p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y) {
          this.kill(p, null, 'crush'); // crushing ignores shields
        }
      }
      this.events.push({ type: 'wallFell', x, y });
      this.nextFallMs += BOMBER.SUDDEN_DEATH_STEP_MS;
    }
  }

  // ------------------------------------------------------- deaths & pickups

  private checkFlameDeaths(): void {
    for (const p of this.players.values()) {
      if (!p.alive || p.immuneMs > 0) continue;
      if (!this.flames.has(idx(Math.floor(p.x), Math.floor(p.y)))) continue;
      if (p.shieldMs > 0) {
        p.shieldMs = 0;
        p.immuneMs = BOMBER.FLAME_MS + 200; // outlive this blast
        this.events.push({ type: 'shieldBlocked', player: p.id });
        continue;
      }
      const owner = this.flames.get(idx(Math.floor(p.x), Math.floor(p.y)))!.owner;
      this.kill(p, owner === p.id ? null : owner, 'explosion');
    }
  }

  private kill(p: BomberPlayer, killer: PlayerId | null, cause: 'explosion' | 'crush'): void {
    if (!p.alive || this.decidedAtMs !== null) return; // decided rounds kill no one
    p.alive = false;
    this.elimOrder.push(p.id);
    if (killer && killer !== p.id) {
      const k = this.players.get(killer);
      if (k) k.kills += 1;
    }
    this.events.push({ type: 'playerDied', player: p.id, killer, cause });
  }

  private checkPickupsAndEscapes(): void {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      const i = idx(cx, cy);
      const powerup = this.powerups.get(i);
      if (powerup) {
        this.powerups.delete(i);
        if (powerup === 'range') p.range = Math.min(BOMBER.RANGE_MAX, p.range + 1);
        if (powerup === 'bomb') p.maxBombs = Math.min(BOMBER.BOMBS_MAX, p.maxBombs + 1);
        if (powerup === 'speed')
          p.speedStacks = Math.min(BOMBER.SPEED_UP_MAX_STACKS, p.speedStacks + 1);
        this.events.push({ type: 'powerupTaken', x: cx, y: cy, kind: powerup, player: p.id });
      }
    }
    // Walk-through grants expire once the player leaves the bomb's cell.
    for (const b of this.bombs.values()) {
      const bx = Math.floor(b.x);
      const by = Math.floor(b.y);
      for (const pid of b.walkThrough) {
        const p = this.players.get(pid);
        if (!p || !p.alive || Math.floor(p.x) !== bx || Math.floor(p.y) !== by) {
          b.walkThrough.delete(pid);
        }
      }
    }
  }

  private checkRoundEnd(dtMs: number): void {
    if (this.result) return;
    if (this.decidedAtMs === null) {
      const alive = [...this.players.values()].filter((p) => p.alive);
      if (alive.length <= 1) {
        this.decidedAtMs = ROUND_END_GRACE_MS;
        this.events.push({ type: 'roundEnded', winner: alive[0]?.id ?? null });
      }
      return;
    }
    this.decidedAtMs -= dtMs;
    if (this.decidedAtMs > 0) return;

    const placements = [...this.elimOrder];
    const winner = [...this.players.values()].find((p) => p.alive) ?? null;
    if (winner) placements.push(winner.id);
    const bonusPoints: Record<PlayerId, number> = {};
    const kills: Record<PlayerId, number> = {};
    for (const p of this.players.values()) {
      kills[p.id] = p.kills;
      bonusPoints[p.id] = p.kills * BOMBER.KILL_BONUS_POINTS;
    }
    this.result = { placements, bonusPoints, kills, winner: winner?.id ?? null };
  }

  // -------------------------------------------------------- GameMode output

  roundResult(): RoundResult | null {
    return this.result;
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot(): BomberSnapshot {
    let gridStr = '';
    for (let i = 0; i < this.grid.length; i++) {
      const c = this.grid[i];
      gridStr += c === Cell.Solid ? CELL.SOLID : c === Cell.Block ? CELL.BLOCK : CELL.FLOOR;
    }
    const players: BomberPlayerSnap[] = [...this.players.values()].map((p) => ({
      id: p.id,
      x: round2(p.x),
      y: round2(p.y),
      dir: p.dir,
      alive: p.alive,
      frozenMs: Math.round(p.frozenMs),
      ghostMs: Math.round(p.ghostMs),
      shieldMs: Math.round(p.shieldMs),
      maxBombs: p.maxBombs,
      range: p.range,
      speedStacks: p.speedStacks,
      kills: p.kills,
      abilityCooldownMs: Math.round(this.abilities.cooldownOf(p.id)),
    }));
    return {
      grid: gridStr,
      players,
      bombs: [...this.bombs.values()].map((b) => ({
        id: b.id,
        x: round2(b.x),
        y: round2(b.y),
        fuse: Math.max(0, Math.min(1, b.fuseMs / BOMBER.BOMB_FUSE_MS)),
      })),
      flames: [...this.flames.keys()].map((i) => ({ x: i % W, y: Math.floor(i / W) })),
      powerups: [...this.powerups.entries()].map(([i, kind]) => ({
        x: i % W,
        y: Math.floor(i / W),
        kind,
      })),
      decoys: this.decoys.map((d) => ({
        id: d.id,
        characterId: d.characterId,
        x: round2(d.x),
        y: round2(d.y),
      })),
      suddenDeath: {
        active: this.suddenDeathOn,
        startsInMs: Math.max(0, BOMBER.SUDDEN_DEATH_AT_MS - this.elapsedMs),
        nextCell:
          this.suddenDeathOn && this.spiralIdx < this.spiral.length
            ? this.spiral[this.spiralIdx]!
            : null,
      },
    };
  }

  botInput(pid: PlayerId): PlayerInput {
    let memory = this.botMemory.get(pid);
    if (!memory) {
      memory = { pathTarget: null, repathInMs: 0, prevAction: false, prevAbility: false };
      this.botMemory.set(pid, memory);
    }
    return computeBotInput(this, pid, memory, this.rng);
  }

  // ------------------------------------------------------- AbilityHost hooks

  isAlive(pid: PlayerId): boolean {
    return this.players.get(pid)?.alive === true;
  }

  positionOf(pid: PlayerId): { x: number; y: number } | null {
    const p = this.players.get(pid);
    return p?.alive ? { x: p.x, y: p.y } : null;
  }

  alivePlayers(): PlayerId[] {
    return [...this.players.values()].filter((p) => p.alive).map((p) => p.id);
  }

  dash(pid: PlayerId): boolean {
    const p = this.players.get(pid);
    if (!p?.alive) return false;
    p.dashMs = DASH_DURATION_MS;
    p.dashDir = p.dir;
    return true;
  }

  teleport(pid: PlayerId): boolean {
    const p = this.players.get(pid);
    if (!p?.alive) return false;
    const v = DIR_VEC[p.dir];
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    for (let d = TELEPORT_RANGE_CELLS; d >= 1; d--) {
      const x = cx + v.x * d;
      const y = cy + v.y * d;
      if (!inBounds(x, y)) continue;
      if (this.grid[idx(x, y)] !== Cell.Floor) continue;
      if (this.bombAtCell(x, y)) continue;
      p.x = x + 0.5;
      p.y = y + 0.5;
      return true;
    }
    return false;
  }

  applyFreeze(pid: PlayerId, ms: number): void {
    const p = this.players.get(pid);
    if (p?.alive) p.frozenMs = ms;
  }

  push(target: PlayerId, fromX: number, fromY: number): void {
    const p = this.players.get(target);
    if (!p?.alive) return;
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    let dir: Dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx >= 0 ? 'right' : 'left';
    else if (Math.abs(dy) > 0) dir = dy >= 0 ? 'down' : 'up';
    else dir = (['up', 'down', 'left', 'right'] as const)[Math.floor(this.rng() * 4)]!;
    p.knockDir = dir;
    p.knockCells = PUSH_DISTANCE_CELLS;
  }

  swap(a: PlayerId, b: PlayerId): void {
    const pa = this.players.get(a);
    const pb = this.players.get(b);
    if (!pa?.alive || !pb?.alive) return;
    [pa.x, pb.x] = [pb.x, pa.x];
    [pa.y, pb.y] = [pb.y, pa.y];
    this.allowBombEscape(pa);
    this.allowBombEscape(pb);
  }

  applyGhost(pid: PlayerId, ms: number): void {
    const p = this.players.get(pid);
    if (p?.alive) p.ghostMs = ms;
  }

  armShield(pid: PlayerId, ms: number): void {
    const p = this.players.get(pid);
    if (p?.alive) p.shieldMs = ms;
  }

  modeAbility(pid: PlayerId, ability: AbilityId): boolean {
    const p = this.players.get(pid);
    if (!p?.alive) return false;
    if (ability === 'bomb-kick') {
      const v = DIR_VEC[p.dir];
      const bomb = this.bombAtCell(Math.floor(p.x) + v.x, Math.floor(p.y) + v.y);
      if (!bomb) return false;
      bomb.slideDir = p.dir;
      return true;
    }
    if (ability === 'decoy') {
      // Bomber bonus (doc lists decoy for Batata): a harmless look-alike that
      // burns like a player — enemies waste bombs on it.
      this.decoys.push({
        id: this.nextDecoyId++,
        owner: p.id,
        characterId: this.deps.characterIdOf(p.id),
        x: Math.floor(p.x) + 0.5,
        y: Math.floor(p.y) + 0.5,
        msLeft: DECOY_DURATION_MS,
      });
      return true;
    }
    return false;
  }
}

function approach(value: number, target: number, maxStep: number): number {
  const delta = target - value;
  if (Math.abs(delta) <= maxStep) return target;
  return value + Math.sign(delta) * maxStep;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
