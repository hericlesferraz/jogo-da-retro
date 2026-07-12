// Keyboard → held-input state, sent to the server only when it changes.

import { IDLE_INPUT, type PlayerInput } from '../../shared/types';
import type { GameSocket } from './socket';

const KEY_MAP: Record<string, keyof PlayerInput> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'action',
  ShiftLeft: 'ability',
  ShiftRight: 'ability',
  KeyE: 'ability',
};

export function setupInput(socket: GameSocket): { current: () => PlayerInput } {
  let state: PlayerInput = { ...IDLE_INPUT };

  const send = () => socket.emit('input', state);

  const set = (key: keyof PlayerInput, value: boolean) => {
    if (state[key] === value) return;
    state = { ...state, [key]: value };
    send();
  };

  // Typing in a form field (room code) must not steer the character.
  const inField = (e: KeyboardEvent): boolean =>
    (e.target as HTMLElement | null)?.tagName === 'INPUT';

  window.addEventListener('keydown', (e) => {
    const key = KEY_MAP[e.code];
    if (!key || inField(e)) return;
    if (e.repeat) return e.preventDefault();
    e.preventDefault();
    set(key, true);
  });
  window.addEventListener('keyup', (e) => {
    const key = KEY_MAP[e.code];
    if (!key || inField(e)) return;
    e.preventDefault();
    set(key, false);
  });
  // Losing focus releases everything (alt-tab mustn't keep you walking).
  window.addEventListener('blur', () => {
    state = { ...IDLE_INPUT };
    send();
  });
  // After a reconnect the server has a fresh idle state; resend ours.
  socket.on('connect', send);

  return { current: () => state };
}
