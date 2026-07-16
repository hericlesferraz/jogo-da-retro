// Client audio: procedural sound effects (WebAudio) plus looping background
// music (one HTMLAudioElement), one scene per screen. Music files are optional
// slots (docs/05-musica.md) — a missing file means silence, never an error.
//
// Browsers only allow audio after a user gesture: the WebAudio context is
// created lazily and unlocked by the first click/keypress, and a music play()
// blocked by the autoplay policy re-tries on that same first gesture.

import { MUSIC_VOLUME } from '../../shared/constants';

// ----------------------------------------------------------------- volume

const VOLUME_KEY = 'retro-volume';
const LEGACY_MUTE_KEY = 'retro-mute';

/** Master volume 0..1 — scales music AND effects; 0 = silence. Persisted:
 * the team plays while on a call, everyone picks their own level. */
let master = ((): number => {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored !== null) {
      const n = Number(stored);
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    }
    // Migration: the old on/off mute becomes volume 0.
    const legacyMuted = localStorage.getItem(LEGACY_MUTE_KEY) === '1';
    localStorage.removeItem(LEGACY_MUTE_KEY);
    return legacyMuted ? 0 : 1;
  } catch {
    return 1;
  }
})();

export function getVolume(): number {
  return master;
}

export function setVolume(v: number): void {
  master = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(VOLUME_KEY, String(master));
  } catch {
    // storage unavailable (private mode) — the level still applies to this visit
  }
  music.onVolumeChange();
}

// ------------------------------------------------------------------ music

export type MusicScene = 'titulo' | 'lobby' | 'bomber' | 'batata';

/** Candidate files per scene — first one that loads wins, none = silence. */
const MUSIC_TRACKS: Record<MusicScene, string[]> = {
  titulo: ['/audio/musica-titulo.mp3'],
  lobby: ['/audio/musica-lobby.mp3'],
  bomber: ['/audio/musica-bomber.mp3', '/audio/musica-partida.mp3'],
  batata: ['/audio/musica-batata.mp3', '/audio/musica-partida.mp3'],
};

const MUSIC_FADE_MS = 400;
const FADE_TICK_MS = 40;

/** Effective music volume — the base level scaled by the master volume. */
const musicTarget = (): number => MUSIC_VOLUME * master;

class MusicPlayer {
  private el: HTMLAudioElement | null = null;
  private scene: MusicScene | null = null;
  /** Track that is (or should be) playing; null = silence. */
  private src: string | null = null;
  private fade: ReturnType<typeof setInterval> | null = null;
  /** Files that failed to load — never retried (missing file = silence). */
  private missing = new Set<string>();
  private waitingGesture = false;

  /** One scene per screen. Same scene is a no-op; null keeps the current one. */
  setScene(scene: MusicScene | null): void {
    if (!scene || scene === this.scene) return;
    this.scene = scene;
    this.refresh();
  }

  /** Re-applies scene + volume to the element (volume 0 means silence). */
  refresh(): void {
    const target =
      this.scene && master > 0
        ? (MUSIC_TRACKS[this.scene].find((t) => !this.missing.has(t)) ?? null)
        : null;
    if (target === this.src) {
      // e.g. unmuted back into the same track, or the unlock gesture arrived
      if (target && this.el?.paused) this.play();
      return;
    }
    // Claim the track NOW: stale play() promises from the outgoing track
    // resolve against this and get ignored (they must not fade back in).
    this.src = target;
    this.fadeOut(() => {
      if (this.src !== target || !target) return; // superseded during the fade
      const el = this.element();
      el.volume = 0; // fade-in starts from silence, never a full-volume blip
      el.src = target;
      this.play();
    });
  }

  private element(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio();
      this.el.loop = true;
      // 404s (and HTML fallback pages) surface here as media errors.
      this.el.addEventListener('error', () => {
        if (this.src && this.el?.src.endsWith(this.src)) this.dropCurrent();
      });
      // No visual, but in the DOM it is easy to inspect while playtesting.
      document.body.append(this.el);
    }
    return this.el;
  }

  private play(): void {
    const src = this.src;
    this.element()
      .play()
      .then(
        () => {
          if (this.src !== src) return; // superseded while starting
          this.fadeIn();
        },
        (err: unknown) => {
          if (this.src !== src) return; // superseded while starting
          const name = (err as DOMException)?.name;
          // Autoplay policy — wait for the first gesture, then try again.
          if (name === 'NotAllowedError') this.awaitGesture();
          // AbortError = interrupted by a pause/new load, not a bad file.
          else if (name !== 'AbortError') this.dropCurrent();
        },
      );
  }

  /** The current file doesn't load: give up on it and try the fallback. */
  private dropCurrent(): void {
    if (!this.src) return;
    this.missing.add(this.src);
    this.src = null;
    this.el?.pause();
    this.refresh();
  }

  private awaitGesture(): void {
    if (this.waitingGesture) return;
    this.waitingGesture = true;
    const retry = () => {
      window.removeEventListener('pointerdown', retry, true);
      window.removeEventListener('keydown', retry, true);
      this.waitingGesture = false;
      this.refresh();
    };
    window.addEventListener('pointerdown', retry, { once: true, capture: true });
    window.addEventListener('keydown', retry, { once: true, capture: true });
  }

  /** Live slider changes: pause/resume via refresh, else adjust in place. */
  onVolumeChange(): void {
    this.refresh();
    if (this.el && !this.el.paused && !this.fade) this.el.volume = musicTarget();
  }

  private clearFade(): void {
    if (this.fade) clearInterval(this.fade);
    this.fade = null;
  }

  /** Ramp down (half the fade budget), pause, then hand over to `then`. */
  private fadeOut(then: () => void): void {
    this.clearFade();
    const el = this.el;
    if (!el || el.paused) {
      then();
      return;
    }
    const step = MUSIC_VOLUME / (MUSIC_FADE_MS / 2 / FADE_TICK_MS);
    this.fade = setInterval(() => {
      el.volume = Math.max(0, el.volume - step);
      if (el.volume <= 0.001) {
        this.clearFade();
        el.pause();
        then();
      }
    }, FADE_TICK_MS);
  }

  private fadeIn(): void {
    this.clearFade();
    const el = this.element();
    const step = MUSIC_VOLUME / (MUSIC_FADE_MS / 2 / FADE_TICK_MS);
    this.fade = setInterval(() => {
      // Target re-read each tick — the slider may move mid-fade.
      const target = musicTarget();
      el.volume = Math.min(target, el.volume + step);
      if (el.volume >= target) this.clearFade();
    }, FADE_TICK_MS);
  }
}

export const music = new MusicPlayer();

// ---------------------------------------------------------------- effects

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null; // no WebAudio — the game plays silently
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, () => void context(), { once: true, capture: true });
}

/** Short tone with a fast decay. `delayMs` schedules it slightly ahead. */
export function beep(
  freq: number,
  ms: number,
  volume = 0.08,
  type: OscillatorType = 'square',
  delayMs = 0,
): void {
  if (master <= 0) return;
  const ac = context();
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume * master, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

/** Explosion: descending thump + a burst of noise. */
export function boom(): void {
  if (master <= 0) return;
  const ac = context();
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
  gain.gain.setValueAtTime(0.35 * master, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.5);

  const len = Math.floor(ac.sampleRate * 0.25);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const ngain = ac.createGain();
  ngain.gain.setValueAtTime(0.22 * master, t);
  ngain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  noise.connect(ngain).connect(ac.destination);
  noise.start(t);
}
