// Character art loading + the code-drawn placeholder (cor + inicial), so
// development and the game itself never block on missing art.
//
// A mode can have specialized skins: art dropped in a subdirectory with the
// same file names (e.g. /personagens/batata/<id>-down.png) is picked up by
// artFor(char, 'batata'), falling back per-image to the base art while it
// loads or when it doesn't exist.

import type { CharacterDef, Dir } from '../../shared/types';

export interface CharacterArt {
  /** Best image for a facing direction (placeholder until art loads).
   * `aspect` = width/height of the source — sliced sprites are tight crops
   * of arbitrary proportions, so renderers must not assume a square. */
  view(dir: Dir): { img: CanvasImageSource; flip: boolean; aspect: number };
  /** src for lobby cards / scoreboards. */
  cardSrc: string;
  isPlaceholder: boolean;
}

/**
 * Contain-fit a sprite into a target box (feet anchored): full height by
 * default, shrinking only when the art is unusually wide.
 */
export function spriteBox(
  aspect: number,
  maxH: number,
  maxW: number,
): { w: number; h: number } {
  let h = maxH;
  let w = h * aspect;
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  return { w, h };
}

const cache = new Map<string, CharacterArt>();

/** "/personagens/x.png" + "batata" → "/personagens/batata/x.png". */
function variantPath(path: string, variant: string): string {
  return path.replace(/\/([^/]+)$/, `/${variant}/$1`);
}

export function artFor(char: CharacterDef, variant?: string): CharacterArt {
  const key = variant ? `${variant}:${char.id}` : char.id;
  const cached = cache.get(key);
  if (cached) return cached;

  // Variant skins only exist for real art; placeholders stay as they are.
  if (variant && char.sprite) {
    const base = artFor(char);
    const sprite = char.sprite;
    const views: Partial<Record<Dir, HTMLImageElement>> =
      typeof sprite === 'string'
        ? { down: loadImage(variantPath(sprite, variant)) }
        : {
            down: loadImage(variantPath(sprite.down, variant)),
            up: loadImage(variantPath(sprite.up, variant)),
            left: loadImage(variantPath(sprite.left, variant)),
            right: loadImage(variantPath(sprite.right, variant)),
          };
    const single = typeof sprite === 'string';
    const art: CharacterArt = {
      view: (dir) => {
        const img = single ? views.down : views[dir];
        if (img && ready(img)) {
          return { img, flip: single && dir === 'left', aspect: aspectOf(img) };
        }
        if (!single && views.down && ready(views.down)) {
          return { img: views.down, flip: false, aspect: aspectOf(views.down) };
        }
        return base.view(dir);
      },
      cardSrc: base.cardSrc,
      isPlaceholder: base.isPlaceholder,
    };
    cache.set(key, art);
    return art;
  }

  const placeholder = drawPlaceholder(char);
  let art: CharacterArt;

  const asPlaceholder = { img: placeholder, flip: false, aspect: 1 };

  if (!char.sprite) {
    art = {
      view: () => asPlaceholder,
      cardSrc: placeholder.toDataURL(),
      isPlaceholder: true,
    };
  } else if (typeof char.sprite === 'string') {
    const img = loadImage(char.sprite);
    art = {
      view: (dir) =>
        ready(img)
          ? { img, flip: dir === 'left', aspect: aspectOf(img) }
          : asPlaceholder,
      cardSrc: char.sprite,
      isPlaceholder: false,
    };
  } else {
    const views: Record<Dir, HTMLImageElement> = {
      down: loadImage(char.sprite.down),
      up: loadImage(char.sprite.up),
      left: loadImage(char.sprite.left),
      right: loadImage(char.sprite.right),
    };
    art = {
      view: (dir) => {
        const img = views[dir];
        if (ready(img)) return { img, flip: false, aspect: aspectOf(img) };
        return ready(views.down)
          ? { img: views.down, flip: false, aspect: aspectOf(views.down) }
          : asPlaceholder;
      },
      cardSrc: char.sprite.down,
      isPlaceholder: false,
    };
  }
  cache.set(key, art);
  return art;
}

function aspectOf(img: HTMLImageElement): number {
  return img.naturalWidth / img.naturalHeight;
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Simple full-body figure: colored body, lighter head, big initial. */
function drawPlaceholder(char: CharacterDef): HTMLCanvasElement {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cor = char.cor || '#888';

  // body
  ctx.fillStyle = cor;
  roundRect(ctx, 24, 40, 48, 50, 12);
  ctx.fill();
  // head
  ctx.fillStyle = lighten(cor, 0.35);
  ctx.beginPath();
  ctx.arc(48, 26, 18, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(41, 25, 2.6, 0, Math.PI * 2);
  ctx.arc(55, 25, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // initial on the chest
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((char.nome[0] ?? '?').toUpperCase(), 48, 66);
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = (v: number) => Math.round(v + (255 - v) * amount);
  const r = ch((n >> 16) & 0xff);
  const g = ch((n >> 8) & 0xff);
  const b = ch(n & 0xff);
  return `rgb(${r}, ${g}, ${b})`;
}
