// Foundation ability system: cooldown bookkeeping, target selection and
// dispatch. Effects that depend on the mode (movement, collision, what a
// shield blocks, bomb-kick/decoy) are resolved through AbilityHost hooks.

import {
  ABILITY_COOLDOWN_MS,
  FREEZE_DURATION_MS,
  GHOST_DURATION_MS,
  SHIELD_DURATION_MS,
  TARGETED_ABILITY_RADIUS_CELLS,
} from '../../shared/constants';
import type { AbilityId, GameEvent, PlayerId } from '../../shared/types';

export interface AbilityHost {
  isAlive(pid: PlayerId): boolean;
  positionOf(pid: PlayerId): { x: number; y: number } | null;
  alivePlayers(): PlayerId[];
  /** Impulse in the current facing/moving direction. False if impossible. */
  dash(pid: PlayerId): boolean;
  /** Short blink in the facing direction. False if no free landing cell. */
  teleport(pid: PlayerId): boolean;
  applyFreeze(pid: PlayerId, ms: number): void;
  /** Knock target away from (fromX, fromY). */
  push(target: PlayerId, fromX: number, fromY: number): void;
  swap(a: PlayerId, b: PlayerId): void;
  applyGhost(pid: PlayerId, ms: number): void;
  armShield(pid: PlayerId, ms: number): void;
  /** Mode-specific abilities (bomb-kick, decoy). False if nothing happened. */
  modeAbility(pid: PlayerId, ability: AbilityId): boolean;
}

export class AbilitySystem {
  private cooldowns = new Map<PlayerId, number>();

  constructor(
    private host: AbilityHost,
    private abilityOf: (pid: PlayerId) => AbilityId | null,
    private emit: (ev: GameEvent) => void,
    private random: () => number = Math.random,
  ) {}

  resetAll(): void {
    this.cooldowns.clear();
  }

  cooldownOf(pid: PlayerId): number {
    return this.cooldowns.get(pid) ?? 0;
  }

  tick(dtMs: number): void {
    for (const [pid, ms] of this.cooldowns) {
      const left = ms - dtMs;
      if (left <= 0) this.cooldowns.delete(pid);
      else this.cooldowns.set(pid, left);
    }
  }

  /** Edge-triggered by the mode. No cooldown is spent on a failed attempt. */
  tryUse(pid: PlayerId): boolean {
    const ability = this.abilityOf(pid);
    if (!ability) return false;
    if (!this.host.isAlive(pid)) return false;
    if (this.cooldownOf(pid) > 0) return false;

    if (!this.execute(pid, ability)) return false;

    this.cooldowns.set(pid, ABILITY_COOLDOWN_MS);
    const pos = this.host.positionOf(pid);
    this.emit({
      type: 'abilityUsed',
      player: pid,
      ability,
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
    });
    return true;
  }

  private execute(pid: PlayerId, ability: AbilityId): boolean {
    switch (ability) {
      case 'dash':
        return this.host.dash(pid);
      case 'teleport':
        return this.host.teleport(pid);
      case 'ghost':
        this.host.applyGhost(pid, GHOST_DURATION_MS);
        return true;
      case 'shield':
        this.host.armShield(pid, SHIELD_DURATION_MS);
        return true;
      case 'freeze': {
        const target = this.nearestEnemy(pid, TARGETED_ABILITY_RADIUS_CELLS);
        if (!target) return false;
        this.host.applyFreeze(target, FREEZE_DURATION_MS);
        return true;
      }
      case 'push': {
        const target = this.nearestEnemy(pid, TARGETED_ABILITY_RADIUS_CELLS);
        const from = this.host.positionOf(pid);
        if (!target || !from) return false;
        this.host.push(target, from.x, from.y);
        return true;
      }
      case 'swap': {
        const others = this.host.alivePlayers().filter((p) => p !== pid);
        const pick = others[Math.floor(this.random() * others.length)];
        if (!pick) return false;
        this.host.swap(pid, pick);
        return true;
      }
      case 'bomb-kick':
      case 'decoy':
        return this.host.modeAbility(pid, ability);
    }
  }

  private nearestEnemy(pid: PlayerId, radius: number): PlayerId | null {
    const from = this.host.positionOf(pid);
    if (!from) return null;
    let best: PlayerId | null = null;
    let bestD = radius * radius;
    for (const other of this.host.alivePlayers()) {
      if (other === pid) continue;
      const pos = this.host.positionOf(other);
      if (!pos) continue;
      const d = (pos.x - from.x) ** 2 + (pos.y - from.y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }
}
