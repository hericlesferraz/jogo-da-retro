import { INTERMISSION_MS } from '../shared/constants';
import type { PlayerId, RoomView } from '../shared/types';
import { characterOf } from './core/characters';
import { setupInput } from './core/input';
import { SnapshotBuffer } from './core/interpolation';
import { connect } from './core/socket';
import {
  hideOverlay,
  renderIntro,
  renderLobby,
  setConnectionStatus,
  setIntermissionCountdown,
  showCountdown,
  showIntermission,
  showPodium,
  showScreen,
  toast,
  updateHud,
} from './core/ui';
import { BomberRenderer } from './modes/bomber/render';

let myId: PlayerId | null = null;
let view: RoomView | null = null;
/** Title screen stays up until the player clicks Entrar (or is mid-match). */
let introDismissed = false;
let intermissionEndsAt = 0;
let lastCountdown: { ms: number; at: number } | null = null;
let lastHudAt = 0;

const buffer = new SnapshotBuffer();
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new BomberRenderer(canvas, (pid) =>
  characterOf(view?.players.find((p) => p.id === pid)?.characterId),
);

renderIntro(() => {
  introDismissed = true;
  if (view) applyScreens(view);
});

const socket = connect((ack) => {
  myId = ack.playerId;
  setConnectionStatus('conectado ✔ — manda o link pro time!');
  // Rejoining mid-match (or already seated) skips the title screen.
  const me = ack.room.players.find((p) => p.id === myId);
  if (ack.room.phase !== 'lobby' || me?.characterId) introDismissed = true;
  onRoomState(ack.room);
});
setupInput(socket);

socket.on('disconnect', () => setConnectionStatus('desconectado — reconectando…'));
socket.on('refused', toast);
socket.on('room:state', onRoomState);
socket.on('game:events', (events) => renderer.handleEvents(events));
socket.on('game:snapshot', (snap) => {
  buffer.push(snap);
  if (snap.countdownMsLeft !== undefined) {
    lastCountdown = { ms: snap.countdownMsLeft, at: performance.now() };
  }
});

function onRoomState(v: RoomView): void {
  const prevPhase = view?.phase;
  view = v;
  if (v.phase !== 'lobby') introDismissed = true; // match started while on the title
  applyScreens(v);
  if (v.phase === 'lobby') {
    hideOverlay();
    buffer.clear();
    renderLobby(v, myId, socket);
    return;
  }
  resize();
  if (v.phase === 'countdown' && prevPhase !== 'countdown') buffer.clear();
  if (v.phase === 'intermission') {
    intermissionEndsAt = performance.now() + INTERMISSION_MS;
    showIntermission(v);
  } else if (v.phase === 'podium') {
    showPodium(v, myId, socket);
  }
}

function applyScreens(v: RoomView): void {
  if (v.phase === 'lobby') showScreen(introDismissed ? 'lobby' : 'intro');
  else showScreen('game');
}

function resize(): void {
  renderer.resize(window.innerWidth - 24, window.innerHeight - 130);
}
window.addEventListener('resize', resize);
resize();

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!view || view.phase === 'lobby') return;

  if (view.phase === 'countdown' && lastCountdown) {
    showCountdown(lastCountdown.ms - (now - lastCountdown.at));
  } else if (view.phase === 'playing') {
    hideOverlay();
  } else if (view.phase === 'intermission') {
    setIntermissionCountdown(Math.max(0, Math.ceil((intermissionEndsAt - now) / 1000)));
  }

  const snap = buffer.sample();
  if (snap) renderer.render(snap, myId);

  if (now - lastHudAt > 100) {
    lastHudAt = now;
    updateHud(view, buffer.latest(), myId);
  }
}
requestAnimationFrame(frame);
