// Batata-Quente — authoritative round logic. Tag with a time bomb: free
// movement, touch to pass, hidden semi-random fuse, arena shrinks one step
// per elimination. The server decides every touch — never the client.

import { AbilitySystem, type AbilityHost } from '../../core/abilities';
import type { ModeDeps, ServerMode } from '../../core/room';
import {
  BATATA,
  DASH_DURATION_MS,
  DASH_SPEED_CELLS_PER_S,
  DECOY_DURATION_MS,
  PUSH_DISTANCE_CELLS,
  PUSH_SPEED_CELLS_PER_S,
  ROUND_END_GRACE_MS,
  TELEPORT_RANGE_CELLS,
} from '../../../shared/constants';
import {
  BATATA_THEMES,
  type AbilityId,
  type BatataPlayerSnap,
  type BatataSnapshot,
  type BatataTheme,
  type Dir,
  type GameEvent,
  type PlayerId,
  type PlayerInput,
  type RoundResult,
} from '../../../shared/types';
import { circleHitsRect, generateObstacles, pointRectDistance, spawnPoints, type Rect } from './arena';
import { computeBotInput, type BotMemory } from './bot';

const { ARENA_W: W, ARENA_H: H, PLAYER_RADIUS: R, TOUCH_RADIUS } = BATATA;

export interface BatataPlayer {
  id: PlayerId;
  x: number; // center, arena units
  y: number;
  /** Unit vector of the last movement — dash/teleport go in any direction. */
  faceX: number;
  faceY: number;
  dir: Dir; // dominant facing axis, for sprites
  alive: boolean;
  frozenMs: number;
  ghostMs: number;
  shieldMs: number;
  /** Can't receive the potato while > 0 (just passed it / shield block). */
  immuneMs: number;
  dashMs: number;
  dashX: number;
  dashY: number;
  /** Forced knockback from `push`: remaining distance in units. */
  knockLeft: number;
  knockX: number;
  knockY: number;
  /** Dodge burst (espaço): short hop away, paired with pass-immunity. */
  dodgeMs: number;
  dodgeX: number;
  dodgeY: number;
  dodgeCooldownMs: number;
  kills: number;
  prevAction: boolean;
  prevAbility: boolean;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Potato {
  /** null while on the ground or respawning. */
  holder: PlayerId | null;
  x: number;
  y: number;
  onGround: boolean;
  groundMs: number;
  fuseMs: number;
  fuseTotalMs: number;
  /** > 0 → exploded, waiting to reappear with a random survivor. */
  respawnInMs: number;
  /** Last player who passed it — credited with the "kill" (+2). */
  lastPasser: PlayerId | null;
  /** Anti-camping clock: time since the last pass/spawn. */
  sincePassMs: number;
}

export class BatataMode implements ServerMode, AbilityHost {
  readonly id = 'batata';

  players = new Map<PlayerId, BatataPlayer>();
  obstacles: Rect[] = [];
  bounds: Bounds = { minX: 0, minY: 0, maxX: W, maxY: H };
  potato: Potato = idlePotato();
  decoys: { id: number; owner: PlayerId; characterId: string; x: number; y: number; msLeft: number }[] = [];

  private boundsTarget: Bounds = { minX: 0, minY: 0, maxX: W, maxY: H };
  private shrinkStage = 0;
  private events: GameEvent[] = [];
  private elimOrder: PlayerId[] = [];
  private result: RoundResult | null = null;
  /** Once decided (≤1 alive), the potato can no longer eliminate anyone. */
  private decidedAtMs: number | null = null;
  private potatoLit = false;
  private nextDecoyId = 1;
  private theme: BatataTheme = 'noite';
  private roundsStarted = 0;

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
    // Fresh look every round: any theme on round 1, never the same twice.
    const pool =
      this.roundsStarted === 0
        ? BATATA_THEMES
        : BATATA_THEMES.filter((t) => t !== this.theme);
    this.theme = pool[Math.floor(this.rng() * pool.length)]!;
    this.roundsStarted += 1;
    this.obstacles = generateObstacles(this.rng);
    this.players.clear();
    this.decoys = [];
    this.events = [];
    this.elimOrder = [];
    this.result = null;
    this.decidedAtMs = null;
    this.shrinkStage = 0;
    this.bounds = { minX: 0, minY: 0, maxX: W, maxY: H };
    this.boundsTarget = { minX: 0, minY: 0, maxX: W, maxY: H };
    this.potato = idlePotato();
    this.potatoLit = false;
    this.abilities.resetAll();
    this.botMemory.clear();

    const spawns = spawnPoints(Math.max(playerIds.length, 2));
    playerIds.forEach((pid, i) => {
      const spawn = spawns[i % spawns.length]!;
      this.players.set(pid, {
        id: pid,
        x: spawn.x,
        y: spawn.y,
        faceX: 0,
        faceY: 1,
        dir: 'down',
        alive: true,
        frozenMs: 0,
        ghostMs: 0,
        shieldMs: 0,
        immuneMs: 0,
        dashMs: 0,
        dashX: 0,
        dashY: 1,
        knockLeft: 0,
        knockX: 0,
        knockY: 1,
        dodgeMs: 0,
        dodgeX: 0,
        dodgeY: 1,
        dodgeCooldownMs: 0,
        kills: 0,
        prevAction: false,
        prevAbility: false,
      });
    });
  }

  // ------------------------------------------------------------------- tick

  tick(dtMs: number, inputs: Map<PlayerId, PlayerInput>): void {
    if (this.result) return;
    this.abilities.tick(dtMs);

    // The round officially starts on the first tick (after the countdown),
    // so the spawn event reaches the clients instead of being drained away.
    if (!this.potatoLit) {
      this.potatoLit = true;
      this.spawnPotato();
    }

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.frozenMs = Math.max(0, p.frozenMs - dtMs);
      p.shieldMs = Math.max(0, p.shieldMs - dtMs);
      p.immuneMs = Math.max(0, p.immuneMs - dtMs);
      p.dashMs = Math.max(0, p.dashMs - dtMs);
      p.dodgeMs = Math.max(0, p.dodgeMs - dtMs);
      p.dodgeCooldownMs = Math.max(0, p.dodgeCooldownMs - dtMs);
      if (p.ghostMs > 0) {
        p.ghostMs = Math.max(0, p.ghostMs - dtMs);
        // Ghost ran out inside an obstacle → get squeezed out, not stuck.
        if (p.ghostMs === 0) this.ejectFromObstacles(p);
      }
    }

    for (const [pid, input] of inputs) {
      const p = this.players.get(pid);
      if (!p || !p.alive) continue;
      // Space (action) = dodge, the mode's panic button; Shift/E = character
      // ability, same key as in Bomber.
      const abilityEdge = input.ability && !p.prevAbility;
      const dodgeEdge = input.action && !p.prevAction;
      p.prevAbility = input.ability;
      p.prevAction = input.action;
      if (p.frozenMs > 0) continue;
      if (abilityEdge) this.abilities.tryUse(pid);
      if (dodgeEdge) this.tryDodge(p);
      this.movePlayer(p, input, dtMs);
    }

    this.tickDecoys(dtMs);
    this.tickBounds(dtMs);
    this.tickPotato(dtMs);
    this.checkRoundEnd(dtMs);
  }

  // -------------------------------------------------------------- movement

  private speedOf(p: BatataPlayer): number {
    let speed = BATATA.BASE_SPEED;
    if (this.potato.holder === p.id) {
      speed *= 1 + BATATA.CARRIER_SPEED_BONUS + this.anticampBonus();
    }
    return speed;
  }

  /** Anti-camping: nobody tagged for a while → the carrier ramps up. */
  private anticampBonus(): number {
    const over = this.potato.sincePassMs - BATATA.ANTICAMP_AFTER_MS;
    if (over <= 0) return 0;
    return Math.min(BATATA.ANTICAMP_MAX_BONUS, (over / 1000) * BATATA.ANTICAMP_RAMP_PER_S);
  }

  /** The escapee's counterplay: costs nothing to try, wasted if mistimed. */
  private tryDodge(p: BatataPlayer): void {
    if (p.dodgeCooldownMs > 0) return;
    if (this.potato.holder === p.id) return; // the carrier has no escape
    p.dodgeCooldownMs = BATATA.DODGE_COOLDOWN_MS;
    p.immuneMs = Math.max(p.immuneMs, BATATA.DODGE_IMMUNITY_MS);
    p.dodgeMs = BATATA.DODGE_BURST_MS;
    p.dodgeX = p.faceX;
    p.dodgeY = p.faceY;
    this.events.push({ type: 'dodged', player: p.id, x: p.x, y: p.y });
  }

  private movePlayer(p: BatataPlayer, input: PlayerInput, dtMs: number): void {
    const dt = dtMs / 1000;

    if (p.knockLeft > 0) {
      const step = Math.min(p.knockLeft, PUSH_SPEED_CELLS_PER_S * dt);
      this.moveCircle(p, p.knockX * step, p.knockY * step);
      p.knockLeft -= step;
      return;
    }
    if (p.dashMs > 0) {
      const step = DASH_SPEED_CELLS_PER_S * dt;
      this.moveCircle(p, p.dashX * step, p.dashY * step);
      return;
    }
    if (p.dodgeMs > 0) {
      const step = BATATA.DODGE_SPEED_CELLS_PER_S * dt;
      this.moveCircle(p, p.dodgeX * step, p.dodgeY * step);
      return;
    }

    let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (vx === 0 && vy === 0) return;
    const len = Math.hypot(vx, vy);
    vx /= len;
    vy /= len;
    p.faceX = vx;
    p.faceY = vy;
    p.dir = dominantDir(vx, vy);
    const step = this.speedOf(p) * dt;
    this.moveCircle(p, vx * step, vy * step);
  }

  /** Axis-separated move: blocked on one axis still slides along the other. */
  private moveCircle(p: BatataPlayer, dx: number, dy: number): void {
    // Already overlapping an obstacle (closing walls can squeeze players into
    // one): let every move through so nobody is ever pinned in place.
    const stuck = p.ghostMs <= 0 && this.overlapsObstacle(p.x, p.y);
    if (dx !== 0 && (stuck || !this.hitsObstacle(p.x + dx, p.y, p))) p.x += dx;
    if (dy !== 0 && (stuck || !this.hitsObstacle(p.x, p.y + dy, p))) p.y += dy;
    this.clampToBounds(p);
  }

  private overlapsObstacle(x: number, y: number): boolean {
    return this.obstacles.some((o) => circleHitsRect(x, y, R, o));
  }

  private hitsObstacle(x: number, y: number, p: BatataPlayer): boolean {
    if (p.ghostMs > 0) return false; // ghost crosses obstacles, never walls
    return this.obstacles.some((o) => circleHitsRect(x, y, R, o));
  }

  private clampToBounds(p: BatataPlayer): void {
    p.x = clamp(p.x, this.bounds.minX + R, this.bounds.maxX - R);
    p.y = clamp(p.y, this.bounds.minY + R, this.bounds.maxY - R);
  }

  /** Nudge a player out of any obstacle they ended up inside (ghost expiry,
   * closing walls). Only exits inside the current bounds count; when a
   * squeeze leaves none, moveCircle's stuck-escape lets them walk out. */
  private ejectFromObstacles(p: BatataPlayer): void {
    const b = this.bounds;
    for (const o of this.obstacles) {
      if (!circleHitsRect(p.x, p.y, R, o)) continue;
      const exits = [
        { x: o.x - R, y: p.y },
        { x: o.x + o.w + R, y: p.y },
        { x: p.x, y: o.y - R },
        { x: p.x, y: o.y + o.h + R },
      ]
        .filter(
          (e) =>
            e.x >= b.minX + R && e.x <= b.maxX - R &&
            e.y >= b.minY + R && e.y <= b.maxY - R,
        )
        .sort(
          (a, c) =>
            (a.x - p.x) ** 2 + (a.y - p.y) ** 2 -
            ((c.x - p.x) ** 2 + (c.y - p.y) ** 2),
        );
      const exit = exits[0];
      if (exit) {
        p.x = exit.x;
        p.y = exit.y;
      }
    }
  }

  // ------------------------------------------------------------- shrinking

  private tickBounds(dtMs: number): void {
    const step = (BATATA.SHRINK_SPEED * dtMs) / 1000;
    this.bounds.minX = approach(this.bounds.minX, this.boundsTarget.minX, step);
    this.bounds.minY = approach(this.bounds.minY, this.boundsTarget.minY, step);
    this.bounds.maxX = approach(this.bounds.maxX, this.boundsTarget.maxX, step);
    this.bounds.maxY = approach(this.bounds.maxY, this.boundsTarget.maxY, step);
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      this.clampToBounds(p);
      // The wall may have squeezed them into an obstacle — pop them out.
      if (p.ghostMs <= 0 && this.overlapsObstacle(p.x, p.y)) {
        this.ejectFromObstacles(p);
      }
    }
    if (this.potato.onGround) {
      this.potato.x = clamp(this.potato.x, this.bounds.minX + R, this.bounds.maxX - R);
      this.potato.y = clamp(this.potato.y, this.bounds.minY + R, this.bounds.maxY - R);
    }
  }

  private shrink(): void {
    this.shrinkStage += 1;
    const ix = Math.min(
      BATATA.SHRINK_STEP_X * this.shrinkStage,
      (W - BATATA.MIN_ARENA_W) / 2,
    );
    const iy = Math.min(
      BATATA.SHRINK_STEP_Y * this.shrinkStage,
      (H - BATATA.MIN_ARENA_H) / 2,
    );
    this.boundsTarget = { minX: ix, minY: iy, maxX: W - ix, maxY: H - iy };
    this.events.push({ type: 'arenaShrunk', stage: this.shrinkStage });
  }

  // ----------------------------------------------------------------- potato

  private spawnPotato(): void {
    const alive = [...this.players.values()].filter((p) => p.alive);
    const pick = alive[Math.floor(this.rng() * alive.length)];
    if (!pick) return;
    this.potato = {
      holder: pick.id,
      x: pick.x,
      y: pick.y,
      onGround: false,
      groundMs: 0,
      fuseTotalMs:
        BATATA.FUSE_MIN_MS + this.rng() * (BATATA.FUSE_MAX_MS - BATATA.FUSE_MIN_MS),
      fuseMs: 0,
      respawnInMs: 0,
      lastPasser: null,
      sincePassMs: 0,
    };
    this.potato.fuseMs = this.potato.fuseTotalMs;
    this.events.push({ type: 'potatoSpawned', holder: pick.id });
  }

  private tickPotato(dtMs: number): void {
    if (this.decidedAtMs !== null) return;
    const pot = this.potato;

    if (pot.respawnInMs > 0) {
      pot.respawnInMs -= dtMs;
      if (pot.respawnInMs <= 0) this.spawnPotato();
      return;
    }

    pot.fuseMs -= dtMs;
    pot.sincePassMs += dtMs;
    const holder = pot.holder ? this.players.get(pot.holder) : null;
    if (holder) {
      pot.x = holder.x;
      pot.y = holder.y;
    }

    if (pot.fuseMs <= 0) return this.explode();

    if (holder) {
      // Touch pass: nearest touchable player takes it. One pass per tick.
      let best: BatataPlayer | null = null;
      let bestD = TOUCH_RADIUS * TOUCH_RADIUS;
      for (const other of this.players.values()) {
        if (other.id === holder.id || !other.alive || other.immuneMs > 0) continue;
        const d = (other.x - holder.x) ** 2 + (other.y - holder.y) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = other;
        }
      }
      if (best) {
        if (best.shieldMs > 0) {
          // Shield blocks one pass; brief immunity so it can't be re-tagged
          // in the very next tick with the shield already gone.
          best.shieldMs = 0;
          best.immuneMs = BATATA.PASS_IMMUNITY_MS;
          this.events.push({ type: 'shieldBlocked', player: best.id });
        } else {
          this.passTo(holder, best);
        }
      }
      // Decoy trick: carrier touches a clone → the potato drops right there.
      // Never their own clone — it spawns at their feet and would be a free
      // instant discard instead of a bait.
      const fooled = this.decoys.find(
        (d) =>
          d.owner !== holder.id &&
          (d.x - holder.x) ** 2 + (d.y - holder.y) ** 2 <= TOUCH_RADIUS * TOUCH_RADIUS,
      );
      if (fooled && pot.holder === holder.id) {
        this.decoys = this.decoys.filter((d) => d.id !== fooled.id);
        pot.holder = null;
        pot.onGround = true;
        pot.groundMs = 0;
        pot.x = fooled.x;
        pot.y = fooled.y;
        pot.lastPasser = holder.id; // the dropper keeps the kill credit
        holder.immuneMs = BATATA.PASS_IMMUNITY_MS; // may run, can't re-grab
        this.events.push({ type: 'potatoDropped', x: pot.x, y: pot.y });
      }
    } else if (pot.onGround) {
      pot.groundMs += dtMs;
      let picker: BatataPlayer | null = null;
      let pickerD = TOUCH_RADIUS * TOUCH_RADIUS;
      let nearest: BatataPlayer | null = null;
      let nearestD = Infinity;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = (p.x - pot.x) ** 2 + (p.y - pot.y) ** 2;
        if (d < nearestD) {
          nearestD = d;
          nearest = p;
        }
        if (p.immuneMs <= 0 && d <= pickerD) {
          pickerD = d;
          picker = p;
        }
      }
      // Nobody dares to touch it forever → it sticks to whoever is closest.
      if (!picker && pot.groundMs >= BATATA.GROUND_PICKUP_TIMEOUT_MS) picker = nearest;
      if (picker) {
        pot.holder = picker.id;
        pot.onGround = false;
        pot.sincePassMs = 0;
        pot.x = picker.x;
        pot.y = picker.y;
        this.events.push({ type: 'potatoPicked', player: picker.id, x: pot.x, y: pot.y });
      }
    }
  }

  private passTo(from: BatataPlayer, to: BatataPlayer): void {
    const pot = this.potato;
    pot.holder = to.id;
    pot.lastPasser = from.id;
    pot.sincePassMs = 0;
    pot.x = to.x;
    pot.y = to.y;
    from.immuneMs = BATATA.PASS_IMMUNITY_MS;
    this.events.push({ type: 'potatoPassed', from: from.id, to: to.id, x: to.x, y: to.y });
  }

  private explode(): void {
    const pot = this.potato;
    const victim = pot.holder ? this.players.get(pot.holder) : null;
    this.events.push({
      type: 'potatoExploded',
      x: pot.x,
      y: pot.y,
      victim: victim?.id ?? null,
    });
    if (victim) this.kill(victim, pot.lastPasser);
    pot.holder = null;
    pot.onGround = false;
    pot.lastPasser = null;
    pot.respawnInMs = BATATA.RESPAWN_MS;
  }

  private kill(p: BatataPlayer, killer: PlayerId | null): void {
    if (!p.alive || this.decidedAtMs !== null) return;
    p.alive = false;
    this.elimOrder.push(p.id);
    if (killer && killer !== p.id) {
      const k = this.players.get(killer);
      if (k) k.kills += 1;
    }
    this.events.push({ type: 'playerDied', player: p.id, killer, cause: 'explosion' });
    this.shrink();
  }

  private tickDecoys(dtMs: number): void {
    this.decoys = this.decoys.filter((d) => {
      d.msLeft -= dtMs;
      return d.msLeft > 0;
    });
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
      bonusPoints[p.id] = p.kills * BATATA.KILL_BONUS_POINTS;
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

  snapshot(): BatataSnapshot {
    const players: BatataPlayerSnap[] = [...this.players.values()].map((p) => ({
      id: p.id,
      x: round2(p.x),
      y: round2(p.y),
      dir: p.dir,
      alive: p.alive,
      frozenMs: Math.round(p.frozenMs),
      ghostMs: Math.round(p.ghostMs),
      shieldMs: Math.round(p.shieldMs),
      immuneMs: Math.round(p.immuneMs),
      kills: p.kills,
      abilityCooldownMs: Math.round(this.abilities.cooldownOf(p.id)),
      dodgeCooldownMs: Math.round(p.dodgeCooldownMs),
    }));
    const pot = this.potato;
    return {
      modeId: 'batata',
      theme: this.theme,
      players,
      potato: {
        holder: pot.respawnInMs > 0 ? null : pot.holder,
        x: round2(pot.x),
        y: round2(pot.y),
        onGround: pot.onGround,
        heat:
          pot.respawnInMs > 0 || pot.fuseTotalMs <= 0
            ? 0
            : clamp(1 - pot.fuseMs / pot.fuseTotalMs, 0, 1),
        respawnInMs: Math.max(0, Math.round(pot.respawnInMs)),
      },
      decoys: this.decoys.map((d) => ({
        id: d.id,
        characterId: d.characterId,
        x: round2(d.x),
        y: round2(d.y),
      })),
      obstacles: this.obstacles.map((o) => ({
        x: round2(o.x),
        y: round2(o.y),
        w: o.w,
        h: o.h,
      })),
      bounds: {
        minX: round2(this.bounds.minX),
        minY: round2(this.bounds.minY),
        maxX: round2(this.bounds.maxX),
        maxY: round2(this.bounds.maxY),
      },
      shrinkStage: this.shrinkStage,
    };
  }

  botInput(pid: PlayerId): PlayerInput {
    let memory = this.botMemory.get(pid);
    if (!memory) {
      memory = { wander: null, rethinkInMs: 0 };
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
    p.dashX = p.faceX;
    p.dashY = p.faceY;
    return true;
  }

  teleport(pid: PlayerId): boolean {
    const p = this.players.get(pid);
    if (!p?.alive) return false;
    for (let d = TELEPORT_RANGE_CELLS; d >= 1; d -= 0.5) {
      const x = clamp(p.x + p.faceX * d, this.bounds.minX + R, this.bounds.maxX - R);
      const y = clamp(p.y + p.faceY * d, this.bounds.minY + R, this.bounds.maxY - R);
      if (this.obstacles.some((o) => circleHitsRect(x, y, R, o))) continue;
      if (Math.hypot(x - p.x, y - p.y) < 1) return false; // clamped to nowhere
      p.x = x;
      p.y = y;
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
    let dx = p.x - fromX;
    let dy = p.y - fromY;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      const a = this.rng() * Math.PI * 2;
      dx = Math.cos(a);
      dy = Math.sin(a);
    } else {
      dx /= len;
      dy /= len;
    }
    p.knockLeft = PUSH_DISTANCE_CELLS;
    p.knockX = dx;
    p.knockY = dy;
  }

  swap(a: PlayerId, b: PlayerId): void {
    const pa = this.players.get(a);
    const pb = this.players.get(b);
    if (!pa?.alive || !pb?.alive) return;
    [pa.x, pb.x] = [pb.x, pa.x];
    [pa.y, pb.y] = [pb.y, pa.y];
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
    if (ability === 'decoy') {
      this.decoys.push({
        id: this.nextDecoyId++,
        owner: p.id,
        characterId: this.deps.characterIdOf(p.id),
        x: p.x,
        y: p.y,
        msLeft: DECOY_DURATION_MS,
      });
      return true;
    }
    return false; // bomb-kick has no meaning here
  }

  /** Distance from a point to the closest obstacle edge (bot steering). */
  obstacleDistance(x: number, y: number): number {
    let best = Infinity;
    for (const o of this.obstacles) {
      best = Math.min(best, pointRectDistance(x, y, o));
    }
    return best;
  }
}

function idlePotato(): Potato {
  return {
    holder: null,
    x: W / 2,
    y: H / 2,
    onGround: false,
    groundMs: 0,
    fuseMs: 0,
    fuseTotalMs: 0,
    respawnInMs: 0,
    lastPasser: null,
    sincePassMs: 0,
  };
}

function dominantDir(vx: number, vy: number): Dir {
  if (Math.abs(vx) >= Math.abs(vy)) return vx >= 0 ? 'right' : 'left';
  return vy >= 0 ? 'down' : 'up';
}

function approach(value: number, target: number, maxStep: number): number {
  const delta = target - value;
  if (Math.abs(delta) <= maxStep) return target;
  return value + Math.sign(delta) * maxStep;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
