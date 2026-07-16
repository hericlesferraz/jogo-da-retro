import { INTERMISSION_MS } from '../shared/constants';
import type { RoomReply } from '../shared/protocol';
import type { GameModeId, PlayerId, RoomView } from '../shared/types';
import { getVolume, music, setVolume } from './core/audio';
import { characterOf } from './core/characters';
import { setupInput } from './core/input';
import { SnapshotBuffer } from './core/interpolation';
import { connect, playerToken } from './core/socket';
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
import { BatataRenderer } from './modes/batata/render';
import { BomberRenderer } from './modes/bomber/render';

const ROOM_KEY = 'retro-sala';

let myId: PlayerId | null = null;
let view: RoomView | null = null;
/** In a room (false on the title screen and while reconnecting). */
let seated = false;
/** Auto-join only with an explicit ?sala= in the URL (refresh/shared link).
 * A bare visit always lands on the title — the last code only pre-fills
 * the join field, so nobody gets trapped in a stale room. */
let roomCode: string | null =
  new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? null;
let intermissionEndsAt = 0;
let lastCountdown: { ms: number; at: number } | null = null;
let lastHudAt = 0;

const buffer = new SnapshotBuffer();
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const charOfPlayer = (pid: PlayerId) =>
  characterOf(view?.players.find((p) => p.id === pid)?.characterId);
const renderers = {
  bomber: new BomberRenderer(canvas, charOfPlayer),
  batata: new BatataRenderer(canvas, charOfPlayer),
};
const activeRenderer = () => renderers[view?.modeId ?? 'bomber'];

const socket = connect();
renderIntro({
  onCreate: (mode: GameModeId) =>
    socket.emit('room:create', { token: playerToken(), mode }, onRoomReply),
  onJoin: (code: string) =>
    socket.emit('room:join', { token: playerToken(), code }, onRoomReply),
  initialCode: roomCode ?? localStorage.getItem(ROOM_KEY) ?? '',
});

function leaveRoom(): void {
  localStorage.removeItem(ROOM_KEY);
  location.href = location.pathname; // reload without ?sala — back to the title
}
(document.getElementById('btn-leave') as HTMLButtonElement).onclick = leaveRoom;

music.setScene('titulo');

// Volume control floats over every screen: the button opens a master-volume
// slider (0 = silence) for music AND effects — the team plays while on a
// call, so "a bit lower" matters more than on/off.
const soundBox = document.getElementById('sound-control') as HTMLDivElement;
const soundBtn = document.getElementById('btn-mute') as HTMLButtonElement;
const volumePopover = document.getElementById('volume-popover') as HTMLDivElement;
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;

function renderSoundButton(): void {
  const v = getVolume();
  soundBtn.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
  soundBtn.title = `Volume: ${Math.round(v * 100)}%`;
}
soundBtn.onclick = () => {
  volumePopover.hidden = !volumePopover.hidden;
  // blur() so space (bomb/dodge) can't re-click the button mid-game
  soundBtn.blur();
};
volumeSlider.oninput = () => {
  setVolume(Number(volumeSlider.value) / 100);
  renderSoundButton();
};
// A focused slider owns the arrow keys — they must not move the character.
volumeSlider.onkeydown = (e) => e.stopPropagation();
// Clicking anywhere else closes the popover and hands focus back to the game.
window.addEventListener(
  'pointerdown',
  (e) => {
    if (!volumePopover.hidden && !soundBox.contains(e.target as Node)) {
      volumePopover.hidden = true;
      volumeSlider.blur();
    }
  },
  true,
);
volumeSlider.value = String(Math.round(getVolume() * 100));
renderSoundButton();

socket.on('connect', () => {
  setConnectionStatus(''); // status only speaks up when something is wrong
  // First load with a remembered code, or a reconnection: retake the seat.
  if (roomCode && !seated) {
    socket.emit('room:join', { token: playerToken(), code: roomCode }, onRoomReply);
  }
});
setupInput(socket);

socket.on('disconnect', () => {
  seated = false;
  setConnectionStatus('desconectado — reconectando…');
});
socket.on('refused', toast);
socket.on('room:state', onRoomState);
socket.on('game:events', (events) => activeRenderer().handleEvents(events));
socket.on('game:snapshot', (snap) => {
  buffer.push(snap);
  if (snap.countdownMsLeft !== undefined) {
    lastCountdown = { ms: snap.countdownMsLeft, at: performance.now() };
  }
});

function onRoomReply(reply: RoomReply): void {
  if (!reply.ok) {
    seated = false;
    roomCode = null;
    localStorage.removeItem(ROOM_KEY);
    history.replaceState(null, '', location.pathname);
    toast(reply.error);
    showScreen('intro');
    music.setScene('titulo');
    return;
  }
  seated = true;
  myId = reply.playerId;
  roomCode = reply.room.code;
  localStorage.setItem(ROOM_KEY, roomCode);
  history.replaceState(null, '', `?sala=${roomCode}`);
  setConnectionStatus('');
  onRoomState(reply.room);
}

function onRoomState(v: RoomView): void {
  const prevPhase = view?.phase;
  view = v;
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
    showPodium(v, myId, socket, leaveRoom);
  }
}

function applyScreens(v: RoomView): void {
  if (!seated) {
    showScreen('intro');
    music.setScene('titulo');
  } else if (v.phase === 'lobby') {
    showScreen('lobby');
    music.setScene('lobby');
  } else {
    showScreen('game');
    music.setScene(v.modeId);
  }
}

function resize(): void {
  activeRenderer().resize(window.innerWidth - 24, window.innerHeight - 130);
}
window.addEventListener('resize', resize);
resize();

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!seated || !view || view.phase === 'lobby') return;

  if (view.phase === 'countdown' && lastCountdown) {
    showCountdown(lastCountdown.ms - (now - lastCountdown.at));
  } else if (view.phase === 'playing') {
    hideOverlay();
  } else if (view.phase === 'intermission') {
    setIntermissionCountdown(Math.max(0, Math.ceil((intermissionEndsAt - now) / 1000)));
  }

  const snap = buffer.sample();
  if (snap?.modeId === 'batata') renderers.batata.render(snap, myId);
  else if (snap) renderers.bomber.render(snap, myId);

  if (now - lastHudAt > 100) {
    lastHudAt = now;
    updateHud(view, buffer.latest(), myId);
  }
}
requestAnimationFrame(frame);
