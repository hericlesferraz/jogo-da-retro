// Headless smoke test: boots the server, joins 2 scripted clients + 2 bots,
// starts a match and asserts the core loop. Bomber: lobby → countdown →
// playing → bomb → explosion → death. Batata (--batata): potato spawn →
// touch pass → explosion → elimination (bots do the chasing). With --full
// it waits for the whole match to reach the podium.
//
//   npx tsx tools/smoke-match.ts [--batata] [--full]

import { spawn } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import config from '../config/personagens.json';
import type { RoomReply } from '../src/shared/protocol';
import type { GameEvent, MatchPhase, PlayerId, RoomView } from '../src/shared/types';

const [CHAR_A, CHAR_B] = config.personagens.map((c) => c.id);
if (!CHAR_A || !CHAR_B) {
  console.error('✘ config/personagens.json precisa de pelo menos 2 personagens');
  process.exit(1);
}

const PORT = 3099;
const FULL = process.argv.includes('--full');
const MODE = process.argv.includes('--batata') ? 'batata' : 'bomber';

function fail(msg: string): never {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

function ok(msg: string): void {
  console.log(`✔ ${msg}`);
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms)),
  ]);

interface Client {
  socket: Socket;
  playerId: PlayerId;
  view: RoomView;
  events: GameEvent[];
}

/** code === null → create a room for MODE; otherwise join the given room. */
async function joinClient(token: string, code: string | null): Promise<Client> {
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const client: Client = { socket, playerId: '', view: null as never, events: [] };
  socket.on('room:state', (v: RoomView) => (client.view = v));
  socket.on('game:events', (evs: GameEvent[]) => client.events.push(...evs));
  const reply = await withTimeout(
    new Promise<RoomReply>((resolve) => {
      socket.on('connect', () => {
        if (code === null) socket.emit('room:create', { token, mode: MODE }, resolve);
        else socket.emit('room:join', { token, code }, resolve);
      });
    }),
    5000,
    `entrar na sala (${token})`,
  );
  if (!reply.ok) fail(`entrada na sala recusada: ${reply.error}`);
  client.playerId = reply.playerId;
  client.view = reply.room;
  return client;
}

const waitFor = (client: Client, what: string, ms: number, test: () => boolean) =>
  withTimeout(
    new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        if (test()) {
          clearInterval(iv);
          resolve();
        }
      }, 30);
    }),
    ms,
    what,
  );

const phaseIs = (client: Client, phase: MatchPhase) => client.view?.phase === phase;

async function main(): Promise<void> {
  // detached → own process group, so we can kill tsx's whole child tree.
  const server = spawn('npx', ['tsx', 'src/server/index.ts'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stderr.on('data', (c: Buffer) => process.stderr.write(`[server] ${c}`));
  process.on('exit', () => {
    try {
      if (server.pid) process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  });
  await withTimeout(
    new Promise<void>((resolve) => {
      server.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('listening')) resolve();
      });
    }),
    10_000,
    'server boot',
  );
  ok('servidor de teste no ar');

  const alice = await joinClient('token-alice', null);
  const code = alice.view.code;
  if (!/^[A-Z2-9]{4}$/.test(code)) fail(`código de sala inválido: ${code}`);
  if (alice.view.modeId !== MODE) fail(`sala criada com modo ${alice.view.modeId}`);
  const bob = await joinClient('token-bob', code);
  if (alice.playerId === bob.playerId) fail('tokens distintos, mesmo player');
  if (!alice.view.players.find((p) => p.id === alice.playerId)?.isHost) {
    fail('quem criou a sala deveria ser host');
  }
  const ghost = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const badReply = await withTimeout(
    new Promise<RoomReply>((resolve) => {
      ghost.on('connect', () =>
        ghost.emit('room:join', { token: 'token-ghost', code: 'ZZZZ' }, resolve),
      );
    }),
    5000,
    'join em sala inexistente',
  );
  if (badReply.ok) fail('sala inexistente deveria recusar');
  ghost.disconnect();
  ok(`sala ${code} criada (${MODE}), 2 clientes dentro, host correto, código errado recusado`);

  alice.socket.emit('lobby:selectCharacter', CHAR_A);
  bob.socket.emit('lobby:selectCharacter', CHAR_B);
  await waitFor(alice, 'seleção refletida', 3000, () =>
    alice.view.players.some((p) => p.characterId === CHAR_B),
  );
  alice.socket.emit('lobby:addBot');
  alice.socket.emit('lobby:addBot');
  alice.socket.emit('lobby:rounds', 1);
  await waitFor(alice, 'bots no lobby', 3000, () =>
    alice.view.players.filter((p) => p.isBot).length === 2,
  );
  ok(`personagens escolhidos, 2 bots, 1 rodada de ${MODE}`);

  alice.socket.emit('lobby:start');
  await waitFor(alice, 'countdown', 3000, () => phaseIs(alice, 'countdown'));
  ok('countdown iniciado');
  await waitFor(alice, 'playing', 5000, () => phaseIs(alice, 'playing'));
  ok('rodada rolando');

  let snapshots = 0;
  alice.socket.on('game:snapshot', () => (snapshots += 1));
  await new Promise((r) => setTimeout(r, 2000));
  if (snapshots < 20) fail(`snapshots insuficientes em 2s: ${snapshots} (esperado ~30)`);
  ok(`snapshots fluindo (${snapshots} em 2s ≈ ${Math.round(snapshots / 2)}Hz)`);

  if (MODE === 'batata') {
    // Humans stand still; the bots hunt them down and pass by touch.
    await waitFor(alice, 'batata acesa', 5000, () =>
      alice.events.some((e) => e.type === 'potatoSpawned'),
    );
    ok('batata nasceu com um jogador');
    await waitFor(alice, 'explosão da batata', 40_000, () =>
      alice.events.some((e) => e.type === 'potatoExploded'),
    );
    ok('batata estourou (fuse oculto ≤ 25s)');
    await waitFor(alice, 'eliminação', 2000, () =>
      alice.events.some((e) => e.type === 'playerDied'),
    );
    ok('portador eliminado');
    await waitFor(alice, 'arena encolheu', 2000, () =>
      alice.events.some((e) => e.type === 'arenaShrunk'),
    );
    ok('arena encolheu um degrau');
    // Worst case: the potato keeps landing on idle humans (25s each cycle)
    // and the final bot-vs-bot duel drags (bots dodge each other now).
    await waitFor(alice, 'repasse por toque', 150_000, () =>
      alice.events.some((e) => e.type === 'potatoPassed'),
    );
    ok('repasse por toque registrado');
  } else {
    // Alice drops a bomb and stays put — dies to her own blast.
    alice.socket.emit('input', { up: false, down: false, left: false, right: false, action: true, ability: false });
    await waitFor(alice, 'bomba plantada', 3000, () =>
      alice.events.some((e) => e.type === 'bombPlaced' && e.owner === alice.playerId),
    );
    ok('bomba plantada');
    await waitFor(alice, 'explosão', 4000, () =>
      alice.events.some((e) => e.type === 'explosion' && e.owner === alice.playerId),
    );
    ok('explosão resolvida');
    await waitFor(alice, 'morte da Alice', 2000, () =>
      alice.events.some((e) => e.type === 'playerDied' && e.player === alice.playerId),
    );
    ok('morte por explosão registrada');
  }

  if (FULL) {
    console.log('… esperando a partida inteira terminar (pressão do modo garante o fim)');
    await waitFor(alice, 'pódio', 300_000, () => phaseIs(alice, 'podium'));
    const rows = alice.view.scoreboard;
    if (rows.length !== 4) fail(`placar deveria ter 4 linhas, tem ${rows.length}`);
    if (rows.some((r) => r.total <= 0)) fail('todo participante deveria pontuar colocação');
    ok(`pódio alcançado — placar: ${rows.map((r) => `${r.characterId}=${r.total}`).join(', ')}`);
  }

  console.log(FULL ? '\n🎉 smoke FULL passou' : '\n🎉 smoke passou');
  process.exit(0);
}

main().catch((err) => fail(String(err?.message ?? err)));
