// Canvas renderer for Bomber Royale. State comes from snapshots; every
// one-shot effect (bursts, labels, shakes) is born from a server event.

import { BOMBER } from '../../../shared/constants';
import type {
  BomberPlayerSnap,
  BomberSnapshot,
  CharacterDef,
  GameEvent,
  PlayerId,
} from '../../../shared/types';
import { beep, boom } from '../../core/audio';
import { ABILITY_META, characterOf, POWERUP_META } from '../../core/characters';
import { artFor, spriteBox } from '../../core/sprites';

interface Fx {
  type: 'ring' | 'particles' | 'label' | 'wallDrop' | 'flash';
  x: number; // cell coords (center-based for ring/label)
  y: number;
  t0: number;
  duration: number;
  color?: string;
  text?: string;
  particles?: { dx: number; dy: number }[];
}

export class BomberRenderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 50;
  /** Arena size follows the snapshot — it scales with the player count. */
  private gridW: number = BOMBER.GRID_W;
  private gridH: number = BOMBER.GRID_H;
  private maxW = 800;
  private maxH = 600;
  private fx: Fx[] = [];
  private flameSeen = new Map<string, number>();
  private lastPos = new Map<PlayerId, { x: number; y: number; movingUntil: number }>();
  private shakeUntil = 0;
  /** Chained bombs emit one explosion event each — one boom is enough. */
  private lastBoomAt = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private charOfPlayer: (pid: PlayerId) => CharacterDef | null,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(maxW: number, maxH: number): void {
    this.maxW = maxW;
    this.maxH = maxH;
    const cssCell = Math.max(
      18,
      Math.floor(Math.min(maxW / this.gridW, maxH / this.gridH)),
    );
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cell = cssCell * dpr;
    this.canvas.width = this.gridW * this.cell;
    this.canvas.height = this.gridH * this.cell;
    this.canvas.style.width = `${this.gridW * cssCell}px`;
    this.canvas.style.height = `${this.gridH * cssCell}px`;
  }

  handleEvents(events: GameEvent[]): void {
    const now = performance.now();
    for (const ev of events) {
      switch (ev.type) {
        case 'explosion': {
          if (now - this.lastBoomAt > 120) {
            this.lastBoomAt = now;
            boom();
          }
          this.shakeUntil = Math.max(this.shakeUntil, now + 180);
          const center = ev.cells[0];
          if (center) {
            this.fx.push({
              type: 'ring',
              x: center.x + 0.5,
              y: center.y + 0.5,
              t0: now,
              duration: 300,
              color: '#ffb830',
            });
          }
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
        case 'powerupTaken':
          this.fx.push({
            type: 'label',
            x: ev.x + 0.5,
            y: ev.y + 0.3,
            t0: now,
            duration: 700,
            text: `${POWERUP_META[ev.kind].icon} ${POWERUP_META[ev.kind].nome}`,
            color: '#4cd964',
          });
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
        case 'wallFell':
          this.fx.push({ type: 'wallDrop', x: ev.x, y: ev.y, t0: now, duration: 240 });
          break;
        case 'suddenDeathStarted':
          this.fx.push({ type: 'flash', x: 0, y: 0, t0: now, duration: 450, color: '#ff5252' });
          this.shakeUntil = Math.max(this.shakeUntil, now + 350);
          break;
        case 'bombPlaced':
          beep(150, 60, 0.05, 'sine');
          this.fx.push({
            type: 'ring',
            x: ev.x + 0.5,
            y: ev.y + 0.5,
            t0: now,
            duration: 180,
            color: '#ffffff55',
          });
          break;
        default:
          break;
      }
    }
  }

  render(snap: BomberSnapshot, myId: PlayerId | null): void {
    if (snap.gridW !== this.gridW || snap.gridH !== this.gridH) {
      this.gridW = snap.gridW;
      this.gridH = snap.gridH;
      this.resize(this.maxW, this.maxH);
    }
    const { ctx, cell } = this;
    const now = performance.now();
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 180;
      ctx.translate(
        (Math.random() - 0.5) * 6 * k * (cell / 50),
        (Math.random() - 0.5) * 6 * k * (cell / 50),
      );
    }

    this.drawGrid(snap, now);
    this.drawPowerups(snap, now);
    this.drawFlames(snap, now);
    this.drawBombs(snap, now);
    this.drawActors(snap, myId, now);
    this.drawFx(now);
    ctx.restore();
  }

  // ------------------------------------------------------------------ tiles

  private drawGrid(snap: BomberSnapshot, now: number): void {
    const { ctx, cell } = this;
    for (let y = 0; y < snap.gridH; y++) {
      for (let x = 0; x < snap.gridW; x++) {
        const c = snap.grid[y * snap.gridW + x];
        const px = x * cell;
        const py = y * cell;
        // floor under everything
        ctx.fillStyle = (x + y) % 2 === 0 ? '#20203a' : '#242440';
        ctx.fillRect(px, py, cell, cell);
        if (c === '#') {
          ctx.fillStyle = '#464673';
          ctx.fillRect(px, py, cell, cell);
          ctx.fillStyle = '#5a5a94';
          ctx.fillRect(px, py, cell, cell * 0.14);
          ctx.fillStyle = '#33334f';
          ctx.fillRect(px, py + cell * 0.86, cell, cell * 0.14);
        } else if (c === 'X') {
          ctx.fillStyle = '#7a5a40';
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
          ctx.fillStyle = '#8d6a4c';
          ctx.fillRect(px + 1, py + 1, cell - 2, cell * 0.14);
          ctx.strokeStyle = '#5f4630';
          ctx.lineWidth = Math.max(1, cell * 0.04);
          ctx.strokeRect(px + cell * 0.08, py + cell * 0.08, cell * 0.84, cell * 0.84);
          ctx.beginPath();
          ctx.moveTo(px + cell * 0.08, py + cell * 0.5);
          ctx.lineTo(px + cell * 0.92, py + cell * 0.5);
          ctx.stroke();
        }
      }
    }
    const next = snap.suddenDeath.nextCell;
    if (next) {
      const pulse = 0.25 + 0.2 * Math.sin(now / 90);
      this.ctx.fillStyle = `rgba(255, 82, 82, ${pulse})`;
      this.ctx.fillRect(next.x * cell, next.y * cell, cell, cell);
    }
  }

  private drawPowerups(snap: BomberSnapshot, now: number): void {
    const { ctx, cell } = this;
    for (const p of snap.powerups) {
      const cx = (p.x + 0.5) * cell;
      const cy = (p.y + 0.5) * cell + Math.sin(now / 300 + p.x + p.y) * cell * 0.04;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${cell * 0.5}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POWERUP_META[p.kind].icon, cx, cy + cell * 0.02);
    }
  }

  private drawFlames(snap: BomberSnapshot, now: number): void {
    const { ctx, cell } = this;
    const present = new Set<string>();
    for (const f of snap.flames) {
      const key = `${f.x},${f.y}`;
      present.add(key);
      if (!this.flameSeen.has(key)) this.flameSeen.set(key, now);
      const age = now - (this.flameSeen.get(key) ?? now);
      const life = Math.min(1, age / BOMBER.FLAME_MS);
      const size = 0.94 - 0.25 * life;
      const px = (f.x + 0.5) * cell;
      const py = (f.y + 0.5) * cell;
      const half = (cell * size) / 2;
      const grad = ctx.createRadialGradient(px, py, cell * 0.05, px, py, half * 1.2);
      grad.addColorStop(0, '#fff3b0');
      grad.addColorStop(0.4, '#ffb830');
      grad.addColorStop(1, 'rgba(255, 82, 40, 0.55)');
      ctx.fillStyle = grad;
      const r = cell * 0.18;
      this.rounded(px - half, py - half, half * 2, half * 2, r);
      ctx.fill();
    }
    for (const key of this.flameSeen.keys()) {
      if (!present.has(key)) this.flameSeen.delete(key);
    }
  }

  private drawBombs(snap: BomberSnapshot, now: number): void {
    const { ctx, cell } = this;
    for (const b of snap.bombs) {
      const px = b.x * cell;
      const py = b.y * cell;
      // pulse speeds up as the fuse runs out
      const rate = 2 + (1 - b.fuse) * 9;
      const pulse = 1 + 0.07 * Math.sin((now / 1000) * rate * Math.PI * 2);
      const r = cell * 0.34 * pulse;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(px, py + cell * 0.3, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Light outline — the dark body was unreadable on the dark floor.
      ctx.fillStyle = b.fuse < 0.25 ? '#5c2430' : '#33334d';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.fuse < 0.25 ? 'rgba(255, 170, 170, 0.95)' : 'rgba(235, 240, 255, 0.9)';
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(px - r * 0.3, py - r * 0.35, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      // fuse spark
      ctx.strokeStyle = '#caa472';
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.quadraticCurveTo(px + r * 0.35, py - r * 1.35, px + r * 0.55, py - r * 1.2);
      ctx.stroke();
      const sparkOn = Math.sin((now / 1000) * rate * Math.PI * 4) > -0.3;
      if (sparkOn) {
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath();
        ctx.arc(px + r * 0.55, py - r * 1.2, cell * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ----------------------------------------------------------------- actors

  private drawActors(snap: BomberSnapshot, myId: PlayerId | null, now: number): void {
    type Actor =
      | { kind: 'player'; p: BomberPlayerSnap }
      | { kind: 'decoy'; d: BomberSnapshot['decoys'][number] };
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
      if (actor.kind === 'player') this.drawPlayer(actor.p, myId, now);
      else this.drawDecoy(actor.d, now);
    }
    // remember screen positions of the dead for death fx
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

  private drawPlayer(p: BomberPlayerSnap, myId: PlayerId | null, now: number): void {
    const { ctx, cell } = this;
    const char = this.charOfPlayer(p.id);
    if (!char) return;
    const px = p.x * cell;
    const py = p.y * cell;
    const moving = (this.lastPos.get(p.id)?.movingUntil ?? 0) > now;
    const bob = moving ? Math.abs(Math.sin(now / 90)) * cell * 0.06 : 0;

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

    // facing marker (subtle triangle at the feet)
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
    const { img, flip, aspect } = artFor(char).view(p.dir);
    const { w, h } = spriteBox(aspect, cell * 1.15, cell * 1.05);
    ctx.translate(px, py + cell * 0.42 - bob);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();

    if (p.shieldMs > 0) {
      const a = 0.5 + 0.25 * Math.sin(now / 130);
      ctx.strokeStyle = `rgba(90, 200, 250, ${a})`;
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.beginPath();
      ctx.arc(px, py - cell * 0.12, cell * 0.52, 0, Math.PI * 2);
      ctx.stroke();
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

  private drawDecoy(d: BomberSnapshot['decoys'][number], now: number): void {
    const { ctx, cell } = this;
    const char = characterOf(d.characterId);
    if (!char) return;
    const px = d.x * cell;
    const py = d.y * cell;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + cell * 0.36, cell * 0.3, cell * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const { img, flip, aspect } = artFor(char).view('down');
    const { w, h } = spriteBox(aspect, cell * 1.15, cell * 1.05);
    ctx.save();
    ctx.translate(px, py + cell * 0.42);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    this.nameTag(char.nome, char.cor, px, py - cell * 0.85);
    void now;
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
        ctx.arc(f.x * cell, f.y * cell, cell * (0.2 + t * 1.4), 0, Math.PI * 2);
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
      } else if (f.type === 'wallDrop') {
        const scale = 1.6 - 0.6 * t;
        const size = cell * scale;
        const px = (f.x + 0.5) * cell - size / 2;
        const py = (f.y + 0.5) * cell - size / 2 - (1 - t) * cell * 0.8;
        ctx.globalAlpha = 0.6 + 0.4 * t;
        ctx.fillStyle = '#4a4a70';
        ctx.fillRect(px, py, size, size);
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
