// The Room owns the match flow: lobby → (countdown → playing → intermission)*
// → podium. The mode only owns what happens inside a round. One room per
// server is enough for one team, but nothing here assumes it.

import type { Server, Socket } from 'socket.io';
import {
  COUNTDOWN_MS,
  DEFAULT_ROUNDS_PER_MATCH,
  INTERMISSION_MS,
  MAX_ROUNDS_PER_MATCH,
  MIN_PLAYERS_TO_START,
  MIN_ROUNDS_PER_MATCH,
  SERVER_TICK_HZ,
  SNAPSHOT_HZ,
  TICK_MS,
} from '../../shared/constants';
import type { ClientToServer, RoomReply, ServerToClient } from '../../shared/protocol';
import {
  IDLE_INPUT,
  type AbilityId,
  type GameMode,
  type GameModeId,
  type LobbyPlayer,
  type MatchPhase,
  type PlayerId,
  type PlayerInput,
  type RoomView,
  type RoundResult,
} from '../../shared/types';
import { getCharacter, loadCharacters } from './characters';
import { Scoreboard } from './scoring';

/** How long a disconnected lobby player keeps their slot (page refresh). */
const LOBBY_DISCONNECT_GRACE_MS = 15_000;
/** A room with no connected humans for this long can be swept away. */
const ROOM_ABANDON_MS = 5 * 60_000;

type IoServer = Server<ClientToServer, ServerToClient>;
type IoSocket = Socket<ClientToServer, ServerToClient>;

/** What the room needs beyond the shared GameMode contract. */
export interface ServerMode extends GameMode {
  /** Present when the mode can drive bot players. */
  botInput?(pid: PlayerId): PlayerInput;
}

export interface ModeDeps {
  abilityOf: (pid: PlayerId) => AbilityId | null;
  characterIdOf: (pid: PlayerId) => string;
}

interface PlayerState {
  id: PlayerId;
  token: string;
  socket: IoSocket | null;
  characterId: string | null;
  isBot: boolean;
  spectator: boolean;
  input: PlayerInput;
  /** Lobby-only: when to drop a disconnected player. */
  removeAt: number | null;
}

export class Room {
  private players = new Map<PlayerId, PlayerState>();
  private hostId: PlayerId | null = null;
  private phase: MatchPhase = 'lobby';
  private roundsPerMatch = DEFAULT_ROUNDS_PER_MATCH;
  private currentRound = 0; // 1-based during a match
  private participants: PlayerId[] = [];
  private scoreboard = new Scoreboard();
  private lastRound: RoundResult | null = null;
  private mode: ServerMode | null = null;
  /** Timestamp when the current countdown/intermission ends. */
  private phaseUntil = 0;
  private tickCount = 0;
  private nextPlayerSeq = 1;
  private nextBotSeq = 1;
  private interval: NodeJS.Timeout;
  /** Since when no human has been connected (null = someone is here). */
  private abandonedAt: number | null = Date.now();

  constructor(
    private io: IoServer,
    readonly code: string,
    private modeId: GameModeId,
    private createMode: (modeId: GameModeId, deps: ModeDeps) => ServerMode,
  ) {
    this.interval = setInterval(() => this.tick(), TICK_MS);
    if (SERVER_TICK_HZ % SNAPSHOT_HZ !== 0) {
      throw new Error('SNAPSHOT_HZ must divide SERVER_TICK_HZ');
    }
  }

  /** The socket.io channel every broadcast goes to. */
  private get channel(): string {
    return `sala:${this.code}`;
  }

  isAbandoned(now: number): boolean {
    return this.abandonedAt !== null && now - this.abandonedAt > ROOM_ABANDON_MS;
  }

  destroy(): void {
    clearInterval(this.interval);
    for (const p of this.players.values()) p.socket?.disconnect(true);
    this.players.clear();
  }

  // -------------------------------------------------------------- connection

  /** Seat a socket in this room (new player or reconnection by token). */
  join(socket: IoSocket, token: string, ack: (reply: RoomReply) => void): void {
    const player = this.findByToken(token) ?? this.addPlayer(token);
    if (player.socket && player.socket.id !== socket.id) {
      player.socket.disconnect(true); // old tab loses; latest tab wins
    }
    player.socket = socket;
    player.removeAt = null;
    socket.data.playerId = player.id;
    socket.join(this.channel);
    this.abandonedAt = null;

    this.electHostIfNeeded();
    ack({ ok: true, playerId: player.id, room: this.view() });
    this.broadcastView();

    socket.on('lobby:selectCharacter', (characterId) =>
      this.selectCharacter(player.id, characterId),
    );
    socket.on('lobby:rounds', (rounds) => this.setRounds(player.id, rounds));
    socket.on('lobby:addBot', () => this.addBot(player.id));
    socket.on('lobby:removeBot', (pid) => this.removeBot(player.id, pid));
    socket.on('lobby:start', () => this.startMatch(player.id));
    socket.on('podium:playAgain', () => this.playAgain(player.id));
    socket.on('input', (input) => this.setInput(player.id, input));
    socket.on('disconnect', () => this.handleDisconnect(player.id, socket));
  }

  private findByToken(token: string): PlayerState | null {
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  private addPlayer(token: string): PlayerState {
    const player: PlayerState = {
      id: `p${this.nextPlayerSeq++}`,
      token,
      socket: null,
      characterId: null,
      isBot: false,
      // Mid-match joiners watch now and can pick a character for the next match.
      spectator: this.phase !== 'lobby',
      input: { ...IDLE_INPUT },
      removeAt: null,
    };
    this.players.set(player.id, player);
    return player;
  }

  private handleDisconnect(pid: PlayerId, socket: IoSocket): void {
    const player = this.players.get(pid);
    if (!player || player.socket?.id !== socket.id) return; // superseded by reconnect
    player.socket = null;
    player.input = { ...IDLE_INPUT };
    if (this.phase === 'lobby') {
      player.removeAt = Date.now() + LOBBY_DISCONNECT_GRACE_MS;
    }
    const anyHuman = [...this.players.values()].some((p) => !p.isBot && p.socket);
    if (!anyHuman && this.abandonedAt === null) this.abandonedAt = Date.now();
    this.electHostIfNeeded();
    this.broadcastView();
  }

  private electHostIfNeeded(): void {
    const host = this.hostId ? this.players.get(this.hostId) : null;
    if (host && host.socket) return;
    this.hostId = null;
    for (const p of this.players.values()) {
      if (!p.isBot && p.socket) {
        this.hostId = p.id;
        break;
      }
    }
  }

  // ------------------------------------------------------------------- lobby

  private refuse(pid: PlayerId, message: string): void {
    this.players.get(pid)?.socket?.emit('refused', message);
  }

  private selectCharacter(pid: PlayerId, characterId: unknown): void {
    const player = this.players.get(pid);
    if (!player) return;
    if (this.phase !== 'lobby' && !player.spectator) {
      return this.refuse(pid, 'A partida já começou.');
    }
    if (characterId === null) {
      player.characterId = null;
      return this.broadcastView();
    }
    if (typeof characterId !== 'string' || !getCharacter(characterId)) return;
    if (this.characterTakenBy(characterId)) {
      return this.refuse(pid, 'Esse personagem já foi escolhido.');
    }
    player.characterId = characterId;
    this.broadcastView();
  }

  private characterTakenBy(characterId: string): PlayerState | null {
    for (const p of this.players.values()) {
      if (p.characterId === characterId) return p;
    }
    return null;
  }

  private setRounds(pid: PlayerId, rounds: unknown): void {
    if (pid !== this.hostId || this.phase !== 'lobby') return;
    if (typeof rounds !== 'number' || !Number.isInteger(rounds)) return;
    this.roundsPerMatch = Math.max(
      MIN_ROUNDS_PER_MATCH,
      Math.min(MAX_ROUNDS_PER_MATCH, rounds),
    );
    this.broadcastView();
  }

  private addBot(pid: PlayerId): void {
    if (pid !== this.hostId || this.phase !== 'lobby') return;
    const free = loadCharacters().filter((c) => !this.characterTakenBy(c.id));
    const pick = free[Math.floor(Math.random() * free.length)];
    if (!pick) return this.refuse(pid, 'Todos os personagens já foram escolhidos.');
    const bot: PlayerState = {
      id: `bot${this.nextBotSeq++}`,
      token: '',
      socket: null,
      characterId: pick.id,
      isBot: true,
      spectator: false,
      input: { ...IDLE_INPUT },
      removeAt: null,
    };
    this.players.set(bot.id, bot);
    this.broadcastView();
  }

  private removeBot(pid: PlayerId, botId: unknown): void {
    if (pid !== this.hostId || this.phase !== 'lobby') return;
    const bot = typeof botId === 'string' ? this.players.get(botId) : null;
    if (!bot?.isBot) return;
    this.players.delete(bot.id);
    this.broadcastView();
  }

  // ------------------------------------------------------------- match flow

  private startMatch(pid: PlayerId): void {
    if (pid !== this.hostId) return this.refuse(pid, 'Só o host pode iniciar.');
    if (this.phase !== 'lobby') return;
    // Picking a character is being ready: the host starts with whoever chose;
    // everyone else watches and joins the next match.
    const entrants = [...this.players.values()].filter((p) => p.characterId);
    if (entrants.length < MIN_PLAYERS_TO_START) {
      return this.refuse(pid, `Precisa de pelo menos ${MIN_PLAYERS_TO_START} jogadores.`);
    }

    this.participants = entrants.map((p) => p.id);
    for (const p of this.players.values()) {
      p.spectator = !p.characterId;
    }
    this.scoreboard.reset();
    this.lastRound = null;
    for (const id of this.participants) this.scoreboard.track(id);
    this.mode = this.createMode(this.modeId, {
      abilityOf: (id) => {
        const charId = this.players.get(id)?.characterId;
        return charId ? (getCharacter(charId)?.habilidade ?? null) : null;
      },
      characterIdOf: (id) => this.players.get(id)?.characterId ?? '',
    });
    this.currentRound = 0;
    this.startRound();
  }

  private startRound(): void {
    if (!this.mode) return;
    this.currentRound += 1;
    for (const p of this.players.values()) p.input = { ...IDLE_INPUT };
    this.mode.startRound(this.participants);
    this.mode.drainEvents(); // discard setup noise, if any
    this.phase = 'countdown';
    this.phaseUntil = Date.now() + COUNTDOWN_MS;
    this.broadcastView();
  }

  private finishRound(result: RoundResult): void {
    this.scoreboard.applyRound(result);
    this.lastRound = result;
    if (this.currentRound >= this.roundsPerMatch) {
      this.phase = 'podium';
    } else {
      this.phase = 'intermission';
      this.phaseUntil = Date.now() + INTERMISSION_MS;
    }
    this.broadcastView();
  }

  private playAgain(pid: PlayerId): void {
    if (pid !== this.hostId || this.phase !== 'podium') return;
    this.phase = 'lobby';
    this.mode = null;
    this.currentRound = 0;
    for (const p of this.players.values()) {
      p.spectator = false;
      if (!p.isBot && !p.socket) p.removeAt = Date.now(); // sweep the disconnected
    }
    this.electHostIfNeeded();
    this.broadcastView();
  }

  // -------------------------------------------------------------- tick loop

  private setInput(pid: PlayerId, input: unknown): void {
    const player = this.players.get(pid);
    if (!player || player.spectator) return;
    const i = input as Partial<PlayerInput> | null;
    if (!i || typeof i !== 'object') return;
    player.input = {
      up: i.up === true,
      down: i.down === true,
      left: i.left === true,
      right: i.right === true,
      action: i.action === true,
      ability: i.ability === true,
    };
  }

  private tick(): void {
    const now = Date.now();
    this.tickCount += 1;

    if (this.phase === 'lobby') {
      this.sweepLobbyDisconnects(now);
      return;
    }
    if (!this.mode) return;

    if (this.phase === 'countdown' && now >= this.phaseUntil) {
      this.phase = 'playing';
      this.broadcastView();
    }

    if (this.phase === 'playing') {
      const inputs = new Map<PlayerId, PlayerInput>();
      for (const id of this.participants) {
        const p = this.players.get(id);
        if (!p) continue;
        inputs.set(id, p.isBot ? (this.mode.botInput?.(id) ?? IDLE_INPUT) : p.input);
      }
      this.mode.tick(TICK_MS, inputs);
      const result = this.mode.roundResult();
      if (result) {
        this.emitNetFrame(); // flush the final snapshot + events first
        return this.finishRound(result);
      }
    }

    if (this.phase === 'intermission' && now >= this.phaseUntil) {
      this.startRound();
      return;
    }

    if (
      (this.phase === 'countdown' || this.phase === 'playing') &&
      this.tickCount % (SERVER_TICK_HZ / SNAPSHOT_HZ) === 0
    ) {
      this.emitNetFrame();
    }
  }

  private emitNetFrame(): void {
    if (!this.mode) return;
    const events = this.mode.drainEvents();
    if (events.length > 0) this.io.to(this.channel).emit('game:events', events);
    this.io.to(this.channel).emit('game:snapshot', {
      t: Date.now(),
      phase: this.phase,
      ...(this.phase === 'countdown'
        ? { countdownMsLeft: Math.max(0, this.phaseUntil - Date.now()) }
        : {}),
      mode: this.mode.snapshot() as never,
    });
  }

  private sweepLobbyDisconnects(now: number): void {
    let changed = false;
    for (const p of this.players.values()) {
      if (!p.isBot && !p.socket && p.removeAt !== null && now >= p.removeAt) {
        this.players.delete(p.id);
        changed = true;
      }
    }
    if (changed) {
      this.electHostIfNeeded();
      this.broadcastView();
    }
  }

  // ------------------------------------------------------------------ views

  private view(): RoomView {
    const players: LobbyPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      characterId: p.characterId,
      connected: p.isBot || p.socket !== null,
      isHost: p.id === this.hostId,
      isBot: p.isBot,
      spectator: p.spectator,
    }));
    return {
      code: this.code,
      phase: this.phase,
      modeId: this.modeId,
      players,
      hostId: this.hostId,
      roundsPerMatch: this.roundsPerMatch,
      currentRound: this.currentRound,
      scoreboard: this.scoreboard.rows(
        (pid) => this.players.get(pid)?.characterId ?? '',
      ),
      lastRound: this.lastRound,
    };
  }

  private broadcastView(): void {
    this.io.to(this.channel).emit('room:state', this.view());
  }
}
