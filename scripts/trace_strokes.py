#!/usr/bin/env python3
"""Vectorize a black-on-white line drawing into brush strokes.

    python3 scripts/trace_strokes.py artwork.png js/hero-strokes.js [preview.png]

Thresholds the drawing, skeletonizes it, walks the skeleton into chains between
endpoints and junctions, joins chains through junctions along the straightest
continuation, and records the local half-width (from the distance transform) at
every point. Output: a JS file assigning window.HERO_STROKES = {width, height,
strokes}, each stroke a list of [x, y, width] in image pixels, longest first.
The hero (js/field.js) turns its signal lines into these strokes.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.morphology import skeletonize, remove_small_objects


def load_mask(path):
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    g = np.asarray(bg.convert("L")).astype(float)
    mask = g < 128
    mask = remove_small_objects(mask, max_size=30)
    return mask


def neighbours(y, x, skel):
    out = []
    h, w = skel.shape
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and skel[yy, xx]:
                out.append((yy, xx))
    return out


def chains_from_skeleton(skel):
    """Split the skeleton into chains between endpoints and junctions."""
    ys, xs = np.nonzero(skel)
    deg = {}
    for y, x in zip(ys, xs):
        deg[(y, x)] = len(neighbours(y, x, skel))
    nodes = {p for p, d in deg.items() if d != 2}
    visited = set()
    chains = []

    def walk(start, nxt):
        chain = [start, nxt]
        visited.add((start, nxt)); visited.add((nxt, start))
        prev, cur = start, nxt
        while cur not in nodes:
            nb = [p for p in neighbours(cur[0], cur[1], skel) if p != prev]
            if not nb:
                break
            prev, cur = cur, nb[0]
            if (prev, cur) in visited:
                break
            visited.add((prev, cur)); visited.add((cur, prev))
            chain.append(cur)
        return chain

    for p in nodes:
        for q in neighbours(p[0], p[1], skel):
            if (p, q) not in visited:
                chains.append(walk(p, q))
    # closed loops without any node (pure cycles)
    for p in deg:
        if p not in nodes and not any((p, q) in visited for q in neighbours(p[0], p[1], skel)):
            q = neighbours(p[0], p[1], skel)[0]
            chains.append(walk(p, q))
    return chains, nodes


def direction(chain, from_end, k=6):
    pts = chain[-k:] if from_end else chain[:k][::-1]
    a, b = np.array(pts[0], float), np.array(pts[-1], float)
    v = b - a
    n = np.linalg.norm(v)
    return v / n if n else v


def join_chains(chains, min_len=8):
    """Greedily join chains that meet at a junction and continue straight."""
    chains = [c for c in chains if len(c) >= 2]
    used = [False] * len(chains)
    ends = {}
    for i, c in enumerate(chains):
        ends.setdefault(c[0], []).append((i, 0))
        ends.setdefault(c[-1], []).append((i, 1))
    strokes = []
    for i in range(len(chains)):
        if used[i]:
            continue
        used[i] = True
        stroke = list(chains[i])
        for side in (1, 0):   # extend forward, then backward
            while True:
                tip = stroke[-1] if side else stroke[0]
                d = direction(stroke, from_end=bool(side))
                best, best_dot = None, 0.3
                for j, e in ends.get(tip, []):
                    if used[j]:
                        continue
                    cand = chains[j] if e == 0 else chains[j][::-1]
                    dj = direction(cand, from_end=False)
                    dot = float(np.dot(d, dj))
                    if dot > best_dot:
                        best, best_dot = (j, cand), dot
                if not best:
                    break
                j, cand = best
                used[j] = True
                if side:
                    stroke.extend(cand[1:])
                else:
                    stroke = cand[::-1][:-1] + stroke
        if len(stroke) >= min_len:
            strokes.append(stroke)
    return strokes


def rdp(points, eps):
    if len(points) < 3:
        return points
    a, b = np.array(points[0]), np.array(points[-1])
    ab = b - a
    n = np.linalg.norm(ab) or 1
    rel = np.array(points[1:-1]) - a
    d = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / n
    i = int(np.argmax(d)) + 1
    if d[i - 1] > eps:
        return rdp(points[:i + 1], eps)[:-1] + rdp(points[i:], eps)
    return [points[0], points[-1]]


def main():
    src, out = sys.argv[1], sys.argv[2]
    preview = sys.argv[3] if len(sys.argv) > 3 else None
    mask = load_mask(src)
    dist = ndi.distance_transform_edt(mask)
    skel = skeletonize(mask)
    chains, nodes = chains_from_skeleton(skel)
    strokes = join_chains(chains)
    result = []
    for s in strokes:
        pts = [(int(x), int(y)) for y, x in s]
        simple = rdp(pts, 1.2)
        # keep width from the full chain by nearest original point
        result.append([[x, y, float(2 * dist[y, x])] for x, y in simple])
    result.sort(key=lambda s: -sum(np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(s, s[1:])))
    # crop to the drawing, with a margin for the stroke widths
    allpts = [p for s in result for p in s]
    pad = 2 + max(p[2] for p in allpts) / 2
    x0 = min(p[0] for p in allpts) - pad; y0 = min(p[1] for p in allpts) - pad
    x1 = max(p[0] for p in allpts) + pad; y1 = max(p[1] for p in allpts) + pad
    result = [[[round(p[0] - x0, 1), round(p[1] - y0, 1), round(p[2], 2)] for p in s] for s in result]
    data = {"width": round(x1 - x0), "height": round(y1 - y0), "strokes": result}
    body = json.dumps(data, separators=(",", ":"))
    open(out, "w").write(("window.HERO_STROKES=" + body + ";\n") if out.endswith(".js") else body)
    print(f"{len(chains)} chains, {len(nodes)} nodes -> {len(result)} strokes; points {sum(len(s) for s in result)}")
    if preview:
        im = Image.new("RGB", (mask.shape[1], mask.shape[0]), (243, 239, 230))
        dr = ImageDraw.Draw(im)
        for k, s in enumerate(result):
            col = (217, 35, 15) if k % 2 == 0 else (21, 19, 15)
            for a, b in zip(s, s[1:]):
                dr.line([a[0], a[1], b[0], b[1]], fill=col, width=max(1, int(round((a[2] + b[2]) / 2))))
        im.save(preview)


if __name__ == "__main__":
    main()
