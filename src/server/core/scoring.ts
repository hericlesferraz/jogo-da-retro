// Placement points, accumulated totals and final ranking with tiebreaks.
// Placement: first eliminated = 1 pt … winner = N pts (N = players in round).
// Final ranking tiebreaks: more round wins, then more kills.

import type { PlayerId, RoundResult, ScoreRow } from '../../shared/types';

export class Scoreboard {
  private totals = new Map<PlayerId, number>();
  private roundWins = new Map<PlayerId, number>();
  private kills = new Map<PlayerId, number>();
  private lastDelta = new Map<PlayerId, number>();
  readonly rounds: RoundResult[] = [];

  reset(): void {
    this.totals.clear();
    this.roundWins.clear();
    this.kills.clear();
    this.lastDelta.clear();
    this.rounds.length = 0;
  }

  /** Ensures players appear on the board from round 1 even with 0 points. */
  track(playerId: PlayerId): void {
    if (!this.totals.has(playerId)) this.totals.set(playerId, 0);
  }

  applyRound(result: RoundResult): void {
    this.rounds.push(result);
    this.lastDelta.clear();
    result.placements.forEach((pid, index) => {
      const placementPoints = index + 1;
      const bonus = result.bonusPoints[pid] ?? 0;
      const delta = placementPoints + bonus;
      this.totals.set(pid, (this.totals.get(pid) ?? 0) + delta);
      this.kills.set(pid, (this.kills.get(pid) ?? 0) + (result.kills[pid] ?? 0));
      this.lastDelta.set(pid, delta);
    });
    if (result.winner) {
      this.roundWins.set(result.winner, (this.roundWins.get(result.winner) ?? 0) + 1);
    }
  }

  /** Rows sorted best→worst; ties (after tiebreaks) share the same rank. */
  rows(characterOf: (pid: PlayerId) => string): ScoreRow[] {
    const rows = [...this.totals.keys()].map((pid) => ({
      playerId: pid,
      characterId: characterOf(pid),
      total: this.totals.get(pid) ?? 0,
      lastRoundDelta: this.lastDelta.get(pid) ?? 0,
      roundWins: this.roundWins.get(pid) ?? 0,
      kills: this.kills.get(pid) ?? 0,
      rank: 0,
    }));
    rows.sort(
      (a, b) =>
        b.total - a.total || b.roundWins - a.roundWins || b.kills - a.kills,
    );
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.rank =
        prev &&
        prev.total === row.total &&
        prev.roundWins === row.roundWins &&
        prev.kills === row.kills
          ? prev.rank
          : i + 1;
    });
    return rows;
  }
}
