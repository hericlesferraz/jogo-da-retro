#!/usr/bin/env python3
"""Slice a character sheet into per-view transparent sprites.

Input: one PNG with 3 views of the same character side by side on a plain
light background, ordered front / right-side / back (the layout produced by
docs/prompt-personagens.md). Output: <id>-down/right/left/up.png with the
background made transparent; "left" is the mirrored right view.

Usage:
    python3 tools/slice_sprites.py art-raw/<id>.png [-o src/client/public/personagens]
"""

import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image

BG_TOLERANCE = 40      # per-channel distance from corner color to count as background
MIN_VIEW_WIDTH = 40    # column segments narrower than this are noise (watermarks)
MAX_ROW_GAP = 15       # vertical gaps inside a view smaller than this stay merged
MARGIN = 2             # transparent padding around each cropped view
SPECK_MAX_AREA = 0.02  # fragments below this fraction of the character's area...
SPECK_MIN_DIST = 20    # ...and farther than this many px from it are removed (watermarks)
DEFRINGE_LUMA = 100    # edge pixels brighter than this are bg-blend halo, not outline (~0-60)
DEFRINGE_PASSES = 4    # max halo thickness peeled, in pixels
POCKET_CANDIDATE = 225 # pixels with every channel above this may form a pocket
POCKET_MIN_BRIGHT = 243  # ...but the component's mean must be nearly pure white
POCKET_MIN_AREA = 30   # smaller whites are eyes/teeth/highlights — keep
POCKET_MAX_WIDTH = 0.2 # pockets are slivers; wide whites are painted content
POCKET_MIN_Y = 0.3     # pockets live in the body (arm/torso, legs); whites in
                       # the head are eyes, glasses shine, cap emblems — keep

VIEW_NAMES = ["down", "right", "up"]  # sheet order: front, side (facing right), back


def flood_background(img: Image.Image) -> bytearray:
    """Mark background pixels by flood-filling from the borders.

    Flood fill (instead of a global color match) keeps background-colored
    pixels *inside* the character — eyes, teeth, highlights — intact.
    """
    w, h = img.size
    px = img.load()
    ref = px[0, 0]

    def is_bg(p):
        return (
            abs(p[0] - ref[0]) <= BG_TOLERANCE
            and abs(p[1] - ref[1]) <= BG_TOLERANCE
            and abs(p[2] - ref[2]) <= BG_TOLERANCE
        )

    mask = bytearray(w * h)  # 1 = background
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not mask[y * w + x] and is_bg(px[x, y]):
                mask[y * w + x] = 1
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not mask[y * w + x] and is_bg(px[x, y]):
                mask[y * w + x] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny * w + nx] and is_bg(px[nx, ny]):
                mask[ny * w + nx] = 1
                queue.append((nx, ny))
    return mask


def column_segments(mask: bytearray, w: int, h: int) -> list[tuple[int, int]]:
    """x-ranges of content separated by fully-background column runs."""
    has_content = [any(not mask[y * w + x] for y in range(h)) for x in range(w)]
    segments = []
    start = None
    for x, filled in enumerate(has_content):
        if filled and start is None:
            start = x
        elif not filled and start is not None:
            segments.append((start, x))
            start = None
    if start is not None:
        segments.append((start, w))
    return [(a, b) for a, b in segments if b - a >= MIN_VIEW_WIDTH]


def row_range(mask: bytearray, w: int, x0: int, x1: int, h: int) -> tuple[int, int]:
    """Main vertical extent inside a column segment.

    Keeps the largest block of content rows, merging across small gaps, so
    detached specks well above/below the character (e.g. watermarks) drop out.
    """
    rows = [any(not mask[y * w + x] for x in range(x0, x1)) for y in range(h)]
    blocks = []
    start = None
    for y, filled in enumerate(rows):
        if filled and start is None:
            start = y
        elif not filled and start is not None:
            blocks.append([start, y])
            start = None
    if start is not None:
        blocks.append([start, h])

    merged = [blocks[0]]
    for blk in blocks[1:]:
        if blk[0] - merged[-1][1] <= MAX_ROW_GAP:
            merged[-1][1] = blk[1]
        else:
            merged.append(blk)
    return tuple(max(merged, key=lambda b: b[1] - b[0]))


def remove_specks(view: Image.Image) -> Image.Image:
    """Erase small fragments detached from the character (e.g. AI watermarks).

    Nearby detached props (floating theme accessories) survive: only fragments
    that are BOTH small and far from the main component are removed.
    """
    w, h = view.size
    alpha = view.getchannel("A").load()
    labels = [0] * (w * h)
    components = []  # (area, x0, y0, x1, y1)

    for sy in range(h):
        for sx in range(w):
            if alpha[sx, sy] == 0 or labels[sy * w + sx]:
                continue
            label = len(components) + 1
            queue = deque([(sx, sy)])
            labels[sy * w + sx] = label
            area, x0, y0, x1, y1 = 0, sx, sy, sx, sy
            while queue:
                x, y = queue.popleft()
                area += 1
                x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and alpha[nx, ny] > 0 and not labels[ny * w + nx]:
                        labels[ny * w + nx] = label
                        queue.append((nx, ny))
            components.append((area, x0, y0, x1, y1))

    main = max(range(len(components)), key=lambda i: components[i][0]) + 1
    main_area, mx0, my0, mx1, my1 = components[main - 1]

    doomed = set()
    for i, (area, x0, y0, x1, y1) in enumerate(components, start=1):
        if i == main:
            continue
        gap_x = max(0, x0 - mx1, mx0 - x1)
        gap_y = max(0, y0 - my1, my0 - y1)
        if area < main_area * SPECK_MAX_AREA and max(gap_x, gap_y) > SPECK_MIN_DIST:
            doomed.add(i)
            print(f"  removed speck: {area}px² at ({x0},{y0})-({x1},{y1})")

    if doomed:
        for y in range(h):
            for x in range(w):
                if labels[y * w + x] in doomed:
                    view.putpixel((x, y), (0, 0, 0, 0))
    return view


def remove_pockets(view: Image.Image) -> Image.Image:
    """Clear enclosed background pockets — e.g. the gap between an arm and
    the torso. They are fully surrounded by content, so the border flood
    fill never reaches them.

    Only thin, nearly-pure-white components qualify: painted whites are
    darker/warmer (Anonymous mask ~217 in the blue channel) or wide (robot
    chest ~50% of the view), and anything touching transparency is the
    silhouette, not a hole.
    """
    px = view.load()
    w, h = view.size
    seen = bytearray(w * h)
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx]:
                continue
            seen[sy * w + sx] = 1
            r, g, b, a = px[sx, sy]
            if a == 0 or min(r, g, b) < POCKET_CANDIDATE:
                continue
            queue = deque([(sx, sy)])
            pts: list[tuple[int, int]] = []
            touches_transparency = False
            while queue:
                x, y = queue.popleft()
                pts.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if not (0 <= nx < w and 0 <= ny < h):
                        touches_transparency = True
                        continue
                    nr, ng, nb, na = px[nx, ny]
                    if na == 0:
                        touches_transparency = True
                    if seen[ny * w + nx]:
                        continue
                    if na > 0 and min(nr, ng, nb) >= POCKET_CANDIDATE:
                        seen[ny * w + nx] = 1
                        queue.append((nx, ny))
            if touches_transparency or len(pts) < POCKET_MIN_AREA:
                continue
            mean_min = sum(min(px[x, y][0], px[x, y][1], px[x, y][2]) for x, y in pts) / len(pts)
            if mean_min < POCKET_MIN_BRIGHT:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            width = max(xs) - min(xs) + 1
            height = max(ys) - min(ys) + 1
            if width > w * POCKET_MAX_WIDTH:
                continue
            # Real gaps (arm-torso, between legs) are vertical slivers; wider-
            # than-tall whites are facial features (eye whites) — keep them.
            if height <= width:
                continue
            if min(ys) < h * POCKET_MIN_Y:
                continue
            for x, y in pts:
                px[x, y] = (0, 0, 0, 0)
            print(f"  removed pocket: {len(pts)}px² at ({min(xs)},{min(ys)})")
    return view


def defringe(view: Image.Image) -> Image.Image:
    """Peel the anti-alias halo: light pixels (background blend) that touch
    transparency.

    This art style always closes silhouettes with a dark outline, so the peel
    stops there; interior whites (masks, shirts, robot bodies) never touch
    transparency and are untouched.
    """
    px = view.load()
    w, h = view.size

    def transparent_neighbor(x: int, y: int) -> bool:
        if x == 0 or y == 0 or x == w - 1 or y == h - 1:
            return True  # the image border counts as outside
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if (dx or dy) and px[x + dx, y + dy][3] == 0:
                    return True  # diagonals too — halos staircase along edges
        return False

    for _ in range(DEFRINGE_PASSES):
        doomed = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                luma = 0.299 * r + 0.587 * g + 0.114 * b
                if luma > DEFRINGE_LUMA and transparent_neighbor(x, y):
                    doomed.append((x, y))
        if not doomed:
            break
        for x, y in doomed:
            px[x, y] = (0, 0, 0, 0)
    return view


def cut_view(img: Image.Image, mask: bytearray, box: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    w = img.size[0]
    view = Image.new("RGBA", (x1 - x0 + 2 * MARGIN, y1 - y0 + 2 * MARGIN), (0, 0, 0, 0))
    src = img.convert("RGBA")
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not mask[y * w + x]:
                view.putpixel((x - x0 + MARGIN, y - y0 + MARGIN), src.getpixel((x, y)))
    return view


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sheet", type=Path, help="character sheet PNG (art-raw/<id>.png)")
    parser.add_argument(
        "-o", "--out", type=Path, default=Path("src/client/public/personagens"),
        help="output directory (default: %(default)s)",
    )
    parser.add_argument(
        "--pockets", action="store_true",
        help="clear enclosed white background pockets (e.g. arm-torso gaps). "
        "Opt-in: on mostly-white characters this can eat body panels",
    )
    args = parser.parse_args()

    char_id = args.sheet.stem
    img = Image.open(args.sheet).convert("RGB")
    w, h = img.size
    mask = flood_background(img)

    segments = column_segments(mask, w, h)
    if len(segments) != 3:
        print(f"error: expected 3 views, found {len(segments)} column segments: {segments}")
        print("check the sheet — views may be touching or the background may not be plain")
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    for (x0, x1), name in zip(segments, VIEW_NAMES):
        y0, y1 = row_range(mask, w, x0, x1, h)
        view = remove_specks(cut_view(img, mask, (x0, y0, x1, y1)))
        if args.pockets:
            view = remove_pockets(view)
        view = defringe(view)
        bbox = view.getbbox()
        if bbox:  # re-trim: speck removal may have freed up edge space
            view = view.crop((max(0, bbox[0] - MARGIN), max(0, bbox[1] - MARGIN),
                              min(view.size[0], bbox[2] + MARGIN), min(view.size[1], bbox[3] + MARGIN)))
        path = args.out / f"{char_id}-{name}.png"
        view.save(path)
        print(f"{path}  {view.size[0]}x{view.size[1]}")
        if name == "right":
            mirrored = view.transpose(Image.FLIP_LEFT_RIGHT)
            path = args.out / f"{char_id}-left.png"
            mirrored.save(path)
            print(f"{path}  {mirrored.size[0]}x{mirrored.size[1]} (mirrored)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
