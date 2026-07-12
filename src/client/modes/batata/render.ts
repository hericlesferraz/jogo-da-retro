// Canvas renderer for Batata-Quente. State comes from snapshots; every
// one-shot effect (rings, labels, shakes) is born from a server event.
// The carrier's red pulsing glow — blinking faster as the fuse burns — is
// the single most important visual in the mode: readable from anywhere.

import { BATATA } from '../../../shared/constants';
import type {
  BatataPlayerSnap,
  BatataSnapshot,
  CharacterDef,
  GameEvent,
  PlayerId,
} from '../../../shared/types';
import { ABILITY_META, characterOf } from '../../core/characters';
import { artFor, spriteBox } from '../../core/sprites';

const { ARENA_W: W, ARENA_H: H } = BATATA;

interface Fx {
  type: 'ring' | 'particles' | 'label' | 'flash';
  x: number; // arena coords
  y: number;
  t0: number;
  duration: number;
  color?: string;
  text?: string;
  particles?: { dx: number; dy: number }[];
}

export class BatataRenderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 50;
  private fx: Fx[] = [];
  private lastPos = new Map<PlayerId, { x: number; y: number; movingUntil: number }>();
  private shakeUntil = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private charOfPlayer: (pid: PlayerId) => CharacterDef | null,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(maxW: number, maxH: number): void {
    const cssCell = Math.max(18, Math.floor(Math.min(maxW / W, maxH / H)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cell = cssCell * dpr;
    this.canvas.width = W * this.cell;
    this.canvas.height = H * this.cell;
    this.canvas.style.width = `${W * cssCell}px`;
    this.canvas.style.height = `${H * cssCell}px`;
  }

  handleEvents(events: GameEvent[]): void {
    const now = performance.now();
    for (const ev of events) {
      switch (ev.type) {
        case 'potatoSpawned': {
          const pos = this.lastPos.get(ev.holder);
          if (pos) {
            this.fx.push({
              type: 'label',
              x: pos.x,
              y: pos.y - 0.6,
              t0: now,
              duration: 900,
              text: '🥔 pegou fogo!',
              color: '#ffb830',
            });
          }
          break;
        }
        case 'potatoPassed': {
          this.fx.push({
            type: 'ring',
            x: ev.x,
            y: ev.y,
            t0: now,
            duration: 350,
            color: '#ff7043',
          });
          const to = this.charOfPlayer(ev.to);
          this.fx.push({
            type: 'label',
            x: ev.x,
            y: ev.y - 0.7,
            t0: now,
            duration: 800,
            text: `🥔→ ${to?.nome ?? '?'}`,
            color: '#ffab91',
          });
          break;
        }
        case 'potatoDropped':
          this.fx.push({
            type: 'label',
            x: ev.x,
            y: ev.y - 0.5,
            t0: now,
            duration: 900,
            text: '🎭 caiu no chão!',
            color: '#ce93d8',
          });
          break;
        case 'potatoPicked': {
          const char = this.charOfPlayer(ev.player);
          this.fx.push({
            type: 'label',
            x: ev.x,
            y: ev.y - 0.6,
            t0: now,
            duration: 800,
            text: `🥔 com ${char?.nome ?? '?'}`,
            color: '#ffab91',
          });
          break;
        }
        case 'potatoExploded': {
          this.shakeUntil = Math.max(this.shakeUntil, now + 260);
          this.fx.push({
            type: 'ring',
            x: ev.x,
            y: ev.y,
            t0: now,
            duration: 450,
            color: '#ffb830',
          });
          this.fx.push({ type: 'flash', x: 0, y: 0, t0: now, duration: 300, color: '#ff5252' });
          break;
        }
        case 'playerDied': {
          const char = this.charOfPlayer(ev.player);
          const pos = this.lastPos.get(ev.player);
          if (pos) {
            this.fx.push({
              type: 'particles',
              x: pos.x,
              y: pos.y,
              t0: now,
              duration: 700,
              color: char?.cor ?? '#fff',
              particles: Array.from({ length: 14 }, (_, i) => {
                const a = (i / 14) * Math.PI * 2;
                const speed = 1.5 + (i % 3) * 0.8;
                return { dx: Math.cos(a) * speed, dy: Math.sin(a) * speed };
              }),
            });
            this.fx.push({
              type: 'label',
              x: pos.x,
              y: pos.y - 0.4,
              t0: now,
              duration: 900,
              text: '💀',
            });
          }
          break;
        }
        case 'arenaShrunk':
          this.shakeUntil = Math.max(this.shakeUntil, now + 200);
          this.fx.push({ type: 'flash', x: 0, y: 0, t0: now, duration: 350, color: '#464673' });
          break;
        case 'abilityUsed': {
          const meta = ABILITY_META[ev.ability];
          this.fx.push({
            type: 'label',
            x: ev.x,
            y: ev.y - 0.6,
            t0: now,
            duration: 750,
            text: `${meta.icon} ${meta.nome}`,
            color: '#9bd0ff',
          });
          break;
        }
        case 'shieldBlocked': {
          const pos = this.lastPos.get(ev.player);
          if (pos) {
            this.fx.push({
              type: 'ring',
              x: pos.x,
              y: pos.y,
              t0: now,
              duration: 400,
              color: '#5ac8fa',
            });
          }
          break;
        }
        case 'dodged':
          this.fx.push({
            type: 'ring',
            x: ev.x,
            y: ev.y,
            t0: now,
            duration: 300,
            color: '#ffffff',
          });
          this.fx.push({
            type: 'label',
            x: ev.x,
            y: ev.y - 0.6,
            t0: now,
            duration: 650,
            text: '🌀 esquivou!',
            color: '#e0f2ff',
          });
          break;
        default:
          break;
      }
    }
  }

  render(snap: BatataSnapshot, myId: PlayerId | null): void {
    const { ctx, cell } = this;
    const now = performance.now();
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 200;
      ctx.translate(
        (Math.random() - 0.5) * 6 * k * (cell / 50),
        (Math.random() - 0.5) * 6 * k * (cell / 50),
      );
    }

    this.drawFloorAndWalls(snap, now);
    this.drawObstacles(snap);
    if (snap.potato.onGround) this.drawGroundPotato(snap, now);
    this.drawActors(snap, myId, now);
    this.drawFx(now);
    ctx.restore();
  }

  // ------------------------------------------------------------- the field

  private drawFloorAndWalls(snap: BatataSnapshot, now: number): void {
    const { ctx, cell } = this;
    // checkered open floor
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#20203a' : '#242440';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // closed-in walls (everything outside the current bounds)
    const b = snap.bounds;
    ctx.fillStyle = '#464673';
    ctx.fillRect(0, 0, b.minX * cell, H * cell);
    ctx.fillRect(b.maxX * cell, 0, (W - b.maxX) * cell, H * cell);
    ctx.fillRect(b.minX * cell, 0, (b.maxX - b.minX) * cell, b.minY * cell);
    ctx.fillRect(b.minX * cell, b.maxY * cell, (b.maxX - b.minX) * cell, (H - b.maxY) * cell);
    // pulsing danger edge along the inner wall face
    const pulse = 0.35 + 0.2 * Math.sin(now / 220);
    ctx.strokeStyle = `rgba(255, 82, 82, ${pulse})`;
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.strokeRect(
      b.minX * cell,
      b.minY * cell,
      (b.maxX - b.minX) * cell,
      (b.maxY - b.minY) * cell,
    );
  }

  private drawObstacles(snap: BatataSnapshot): void {
    const { ctx, cell } = this;
    for (const o of snap.obstacles) {
      const px = o.x * cell;
      const py = o.y * cell;
      const pw = o.w * cell;
      const ph = o.h * cell;
      ctx.fillStyle = '#7a5a40';
      ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.fillStyle = '#8d6a4c';
      ctx.fillRect(px + 1, py + 1, pw - 2, ph * 0.14);
      ctx.strokeStyle = '#5f4630';
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.strokeRect(px + pw * 0.08, py + ph * 0.08, pw * 0.84, ph * 0.84);
    }
  }

  // ----------------------------------------------------------------- potato

  /** Blink rate ramps with heat — the "hidden timer" tell from the doc. */
  private potatoPulse(heat: number, now: number): number {
    const rate = 0.9 + heat * 6; // Hz
    return Math.max(0, Math.sin((now / 1000) * rate * Math.PI * 2));
  }

  private drawGroundPotato(snap: BatataSnapshot, now: number): void {
    const { ctx, cell } = this;
    const pot = snap.potato;
    const px = pot.x * cell;
    const py = pot.y * cell;
    const pulse = this.potatoPulse(pot.heat, now);
    const glow = ctx.createRadialGradient(px, py, cell * 0.1, px, py, cell * (0.9 + pulse * 0.3));
    glow.addColorStop(0, `rgba(255, 82, 82, ${0.35 + pulse * 0.3})`);
    glow.addColorStop(1, 'rgba(255, 82, 82, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, cell * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${cell * 0.7}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🥔', px, py + Math.sin(now / 250) * cell * 0.05);
  }

  // ----------------------------------------------------------------- actors

  private drawActors(snap: BatataSnapshot, myId: PlayerId | null, now: number): void {
    type Actor =
      | { kind: 'player'; p: BatataPlayerSnap }
      | { kind: 'decoy'; d: BatataSnapshot['decoys'][number] };
    const actors: Actor[] = [
      ...snap.players.filter((p) => p.alive).map((p) => ({ kind: 'player' as const, p })),
      ...snap.decoys.map((d) => ({ kind: 'decoy' as const, d })),
    ];
    actors.sort((a, b) => {
      const ay = a.kind === 'player' ? a.p.y : a.d.y;
      const by = b.kind === 'player' ? b.p.y : b.d.y;
      return ay - by;
    });
    for (const actor of actors) {
      if (actor.kind === 'player') this.drawPlayer(snap, actor.p, myId, now);
      else this.drawDecoy(actor.d);
    }
    for (const p of snap.players) {
      if (p.alive) {
        const prev = this.lastPos.get(p.id);
        const moving = !prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.004;
        this.lastPos.set(p.id, {
          x: p.x,
          y: p.y,
          movingUntil: moving ? now + 120 : (prev?.movingUntil ?? 0),
        });
      }
    }
  }

  private drawPlayer(
    snap: BatataSnapshot,
    p: BatataPlayerSnap,
    myId: PlayerId | null,
    now: number,
  ): void {
    const { ctx, cell } = this;
    const char = this.charOfPlayer(p.id);
    if (!char) return;
    const px = p.x * cell;
    const py = p.y * cell;
    const isCarrier = snap.potato.holder === p.id;
    const moving = (this.lastPos.get(p.id)?.movingUntil ?? 0) > now;
    const bob = moving ? Math.abs(Math.sin(now / 90)) * cell * 0.06 : 0;

    // carrier: big red pulsing glow, visible from across the arena
    if (isCarrier) {
      const pulse = this.potatoPulse(snap.potato.heat, now);
      const radius = cell * (1.1 + pulse * 0.35);
      const glow = ctx.createRadialGradient(px, py, cell * 0.15, px, py, radius);
      glow.addColorStop(0, `rgba(255, 60, 40, ${0.4 + pulse * 0.35})`);
      glow.addColorStop(1, 'rgba(255, 60, 40, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.id === myId) {
      const pulse = 0.35 + 0.15 * Math.sin(now / 250);
      ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      ctx.beginPath();
      ctx.ellipse(px, py + cell * 0.34, cell * 0.4, cell * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + cell * 0.36, cell * 0.3, cell * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // facing marker
    const arrow = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
    ctx.fillStyle = hexWithAlpha(char.cor, 0.85);
    const ax = px + arrow[0]! * cell * 0.42;
    const ay = py + cell * 0.34 + arrow[1]! * cell * 0.18;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(arrow[1]!, arrow[0]!) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -cell * 0.09);
    ctx.lineTo(cell * 0.07, cell * 0.05);
    ctx.lineTo(-cell * 0.07, cell * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    if (p.ghostMs > 0) ctx.globalAlpha = 0.45 + 0.1 * Math.sin(now / 120);
    const { img, flip, aspect } = artFor(char, 'batata').view(p.dir);
    const { w, h } = spriteBox(aspect, cell * 1.15, cell * 1.05);
    ctx.translate(px, py + cell * 0.42 - bob);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();

    // the potato itself rides on the carrier's shoulder
    if (isCarrier) {
      ctx.font = `${cell * 0.5}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const wob = Math.sin(now / 120) * cell * 0.06;
      ctx.fillText('🥔', px + cell * 0.42, py - cell * 0.75 - bob + wob);
    }

    if (p.shieldMs > 0) {
      const a = 0.5 + 0.25 * Math.sin(now / 130);
      ctx.strokeStyle = `rgba(90, 200, 250, ${a})`;
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.beginPath();
      ctx.arc(px, py - cell * 0.12, cell * 0.52, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.immuneMs > 0) {
      // just passed / blocked: dashed "can't take it" ring
      ctx.setLineDash([cell * 0.12, cell * 0.1]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = Math.max(1.5, cell * 0.04);
      ctx.beginPath();
      ctx.arc(px, py - cell * 0.12, cell * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.frozenMs > 0) {
      ctx.fillStyle = 'rgba(120, 200, 255, 0.4)';
      this.rounded(px - cell * 0.4, py - cell * 0.75, cell * 0.8, cell * 1.15, cell * 0.15);
      ctx.fill();
      ctx.strokeStyle = 'rgba(190, 230, 255, 0.8)';
      ctx.lineWidth = Math.max(1.5, cell * 0.04);
      this.rounded(px - cell * 0.4, py - cell * 0.75, cell * 0.8, cell * 1.15, cell * 0.15);
      ctx.stroke();
    }

    this.nameTag(char.nome, char.cor, px, py - cell * 0.85 - bob);
  }

  private drawDecoy(d: BatataSnapshot['decoys'][number]): void {
    const { ctx, cell } = this;
    const char = characterOf(d.characterId);
    if (!char) return;
    const px = d.x * cell;
    const py = d.y * cell;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + cell * 0.36, cell * 0.3, cell * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const { img, flip, aspect } = artFor(char, 'batata').view('down');
    const { w, h } = spriteBox(aspect, cell * 1.15, cell * 1.05);
    ctx.save();
    ctx.translate(px, py + cell * 0.42);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    this.nameTag(char.nome, char.cor, px, py - cell * 0.85);
  }

  private nameTag(nome: string, cor: string, px: number, py: number): void {
    const { ctx, cell } = this;
    ctx.font = `600 ${Math.max(10, cell * 0.24)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(nome, px, py);
    ctx.fillStyle = cor;
    ctx.fillText(nome, px, py);
  }

  // -------------------------------------------------------------------- fx

  private drawFx(now: number): void {
    const { ctx, cell } = this;
    this.fx = this.fx.filter((f) => now - f.t0 < f.duration);
    for (const f of this.fx) {
      const t = (now - f.t0) / f.duration;
      if (f.type === 'ring') {
        ctx.strokeStyle = f.color ?? '#fff';
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = Math.max(2, cell * 0.08 * (1 - t));
        ctx.beginPath();
        ctx.arc(f.x * cell, f.y * cell, cell * (0.2 + t * 1.6), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.type === 'particles' && f.particles) {
        ctx.fillStyle = f.color ?? '#fff';
        ctx.globalAlpha = 1 - t;
        for (const part of f.particles) {
          const px = (f.x + part.dx * t) * cell;
          const py = (f.y + part.dy * t + 1.2 * t * t) * cell;
          ctx.fillRect(px, py, Math.max(2, cell * 0.08), Math.max(2, cell * 0.08));
        }
        ctx.globalAlpha = 1;
      } else if (f.type === 'label' && f.text) {
        ctx.font = `700 ${Math.max(11, cell * 0.3)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const py = (f.y - t * 0.6) * cell;
        ctx.lineWidth = Math.max(2, cell * 0.08);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(f.text, f.x * cell, py);
        ctx.fillStyle = f.color ?? '#fff';
        ctx.fillText(f.text, f.x * cell, py);
        ctx.globalAlpha = 1;
      } else if (f.type === 'flash') {
        ctx.fillStyle = f.color ?? '#fff';
        ctx.globalAlpha = 0.25 * (1 - t);
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalAlpha = 1;
      }
    }
  }

  private rounded(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}
