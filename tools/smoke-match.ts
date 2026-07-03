// Headless smoke test: boots the server, joins 2 scripted clients + 2 bots,
// starts a match and asserts the core loop (lobby → countdown → playing →
// bomb → explosion → death). With --full it waits for the whole match to
// reach the podium (bots + sudden death guarantee it ends).
//
//   npx tsx tools/smoke-match.ts [--full]

import { spawn } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import type { JoinAck } from '../src/shared/protocol';
import type { GameEvent, MatchPhase, RoomView } from '../src/shared/types';

const PORT = 3099;
const FULL = process.argv.includes('--full');

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
  ack: JoinAck;
  view: RoomView;
  events: GameEvent[];
}

async function joinClient(token: string): Promise<Client> {
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const client: Client = { socket, ack: null as never, view: null as never, events: [] };
  socket.on('room:state', (v: RoomView) => (client.view = v));
  socket.on('game:events', (evs: GameEvent[]) => client.events.push(...evs));
  client.ack = await withTimeout(
    new Promise<JoinAck>((resolve) => {
      socket.on('connect', () => socket.emit('join', { token }, resolve));
    }),
    5000,
    `join ${token}`,
  );
  client.view = client.ack.room;
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

  const alice = await joinClient('token-alice');
  const bob = await joinClient('token-bob');
  if (alice.ack.playerId === bob.ack.playerId) fail('tokens distintos, mesmo player');
  if (!alice.view.players.find((p) => p.id === alice.ack.playerId)?.isHost) {
    fail('primeiro a entrar deveria ser host');
  }
  ok('2 clientes no lobby, host correto');

  alice.socket.emit('lobby:selectCharacter', 'exemplo-1');
  bob.socket.emit('lobby:selectCharacter', 'exemplo-2');
  await waitFor(alice, 'seleção refletida', 3000, () =>
    alice.view.players.some((p) => p.characterId === 'exemplo-2'),
  );
  alice.socket.emit('lobby:ready', true);
  bob.socket.emit('lobby:ready', true);
  alice.socket.emit('lobby:addBot');
  alice.socket.emit('lobby:addBot');
  alice.socket.emit('lobby:rounds', 1);
  await waitFor(alice, 'bots no lobby', 3000, () =>
    alice.view.players.filter((p) => p.isBot).length === 2,
  );
  ok('personagens escolhidos, prontos, 2 bots, 1 rodada');

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

  // Alice drops a bomb and stays put — dies to her own blast.
  alice.socket.emit('input', { up: false, down: false, left: false, right: false, action: true, ability: false });
  await waitFor(alice, 'bomba plantada', 3000, () =>
    alice.events.some((e) => e.type === 'bombPlaced' && e.owner === alice.ack.playerId),
  );
  ok('bomba plantada');
  await waitFor(alice, 'explosão', 4000, () =>
    alice.events.some((e) => e.type === 'explosion' && e.owner === alice.ack.playerId),
  );
  ok('explosão resolvida');
  await waitFor(alice, 'morte da Alice', 2000, () =>
    alice.events.some((e) => e.type === 'playerDied' && e.player === alice.ack.playerId),
  );
  ok('morte por explosão registrada');

  if (FULL) {
    console.log('… esperando a partida inteira terminar (morte súbita garante ≤ ~3min)');
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
