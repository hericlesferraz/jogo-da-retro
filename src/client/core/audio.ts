// Procedural sound effects via WebAudio — no asset files needed for v1.
// Music and file-based effects (docs/01, seção Áudio) come with the polish
// pass; these cover the tension arc of the potato (tick → pass → boom).
//
// Browsers only allow audio after a user gesture: the context is created
// lazily and unlocked by the first click/keypress (picking a character or
// simply moving already satisfies it).

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
  const ac = context();
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

/** Explosion: descending thump + a burst of noise. */
export function boom(): void {
  const ac = context();
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
  gain.gain.setValueAtTime(0.35, t);
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
  ngain.gain.setValueAtTime(0.22, t);
  ngain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  noise.connect(ngain).connect(ac.destination);
  noise.start(t);
}
