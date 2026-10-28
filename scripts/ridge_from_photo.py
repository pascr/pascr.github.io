#!/usr/bin/env python3
"""Build the hero illustration (_includes/ridge.svg) from the Alps photo.

Monoline hatching, in the manner of a vintage print: the photo's skyline is
traced (the sky is a smooth gradient, the ridge a hard edge) and simplified
into a clean outline; the mass is split into faces at peaks and valleys and
each face is filled with parallel hatch lines, horizontal for lit faces,
diagonal for shadow faces. A far range in sparser hatch, a hatched lake and a red dotted ski-touring track
to a flag on the summit complete the scene. One line colour (currentColor), so it
follows the light and dark themes.

    python3 scripts/ridge_from_photo.py

Requires Pillow and numpy.
"""
import random
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "assets" / "alps-cover.jpg"
OUT = ROOT / "_includes" / "ridge.svg"

HORIZON_SRC = 512.0
VB_W, VB_H = 1600.0, 1000.0
HORIZON = 700.0
EXAG = 4.6              # vertical exaggeration of the traced heights
SIMPLIFY = 9.0          # outline tolerance
PROMINENCE = 70         # minimum drop around a peak for it to get its own face
SLANT = 0.34            # how far the divider from a peak leans to the right per unit of height
SEED = 11


def trace(photo):
    a = np.asarray(Image.open(photo).convert("RGB")).astype(float)
    h, w, _ = a.shape
    lum = a.mean(axis=2)
    ridge = np.zeros(w, dtype=int)
    for x in range(w):
        col = a[:, x, :]
        y = 0
        while y < h - 1:
            if np.abs(col[y + 1] - col[y]).sum() > 24 or lum[y + 1, x] < 95:
                break
            y += 1
        ridge[x] = y
    k = 9
    return np.array([np.median(ridge[max(0, x - k):x + k + 1]) for x in range(w)], dtype=float)


def smooth(ys, k):
    return np.convolve(np.pad(ys, k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), mode="valid")


def rdp(points, eps):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5 or 1
    dmax, idx = 0, 0
    for i in range(1, len(points) - 1):
        x, y = points[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(points[:idx + 1], eps)[:-1] + rdp(points[idx:], eps)
    return [points[0], points[-1]]


def to_draw(y, exag=EXAG):
    return HORIZON - (HORIZON_SRC - y) * exag


def outline(ys, eps, exag):
    pts = [(-40.0, to_draw(ys[0], exag))] + [(float(x), to_draw(ys[x], exag)) for x in range(len(ys))] + [(VB_W + 40, to_draw(ys[-1], exag))]
    return rdp(pts, eps)


def extrema(pts, prominence):
    """Indices of peaks (with enough drop on both sides) and the valleys between them."""
    n = len(pts)
    peaks = []
    for i in range(1, n - 1):
        if pts[i][1] <= pts[i - 1][1] and pts[i][1] < pts[i + 1][1]:
            left = max(p[1] for p in pts[:i]) if i else pts[i][1]
            right = max(p[1] for p in pts[i + 1:])
            # drop until the outline next climbs above this peak
            def drop(side):
                best = pts[i][1]
                rng = range(i - 1, -1, -1) if side < 0 else range(i + 1, n)
                for j in rng:
                    if pts[j][1] < pts[i][1]:
                        break
                    best = max(best, pts[j][1])
                return best - pts[i][1]
            if drop(-1) >= prominence and drop(1) >= prominence:
                peaks.append(i)
    ext = []
    for a, b in zip(peaks, peaks[1:]):
        v = max(range(a, b + 1), key=lambda j: pts[j][1])
        ext.append((a, "peak")); ext.append((v, "valley"))
    if peaks:
        ext.append((peaks[-1], "peak"))
    return ext


def fmt(points):
    return " ".join("%.0f,%.1f" % p for p in points)


def faces(pts, ext):
    """Split the mass into faces between consecutive dividers; returns (polygon, kind) pairs."""
    dividers = [(-40.0, -40.0, 0)]          # (top x index proxy, bottom x, index) -> use indices
    divs = []
    for idx, kind in ext:
        x, y = pts[idx]
        if kind == "peak":
            bottom = x + SLANT * (HORIZON - y)
        else:
            bottom = x
        divs.append((idx, bottom, kind))
    # keep dividers in order and non-crossing
    cleaned = []
    for d in divs:
        if cleaned and d[1] <= cleaned[-1][1] + 30:
            continue
        cleaned.append(d)
    out = []
    prev_idx, prev_bottom = 0, pts[0][0]
    lit = True
    for idx, bottom, kind in cleaned + [(len(pts) - 1, pts[-1][0], "end")]:
        seg = pts[prev_idx:idx + 1]
        polygon = seg + [(bottom, HORIZON), (prev_bottom, HORIZON)]
        # the face that ends at a peak climbs: lit. The face that ends at a valley descends: shadow.
        out.append((polygon, "lit" if kind == "peak" else "shadow"))
        prev_idx, prev_bottom = idx, bottom
    return out


def pine(x, h, rng):
    w = h * 0.42
    top = (x, VB_H - h)
    base_l, base_r = (x - w, VB_H + 2), (x + w, VB_H + 2)
    branches = []
    for k in range(1, 6):
        t = k / 6
        yy = top[1] + h * t
        branches.append(f'<line x1="{x:.0f}" y1="{yy:.0f}" x2="{x - w * t * 0.92:.0f}" y2="{yy + h * 0.06:.0f}"/>')
        branches.append(f'<line x1="{x:.0f}" y1="{yy:.0f}" x2="{x + w * t * 0.92:.0f}" y2="{yy + h * 0.06:.0f}"/>')
    return (f'<g class="pine"><polygon points="{fmt([top, base_r, base_l])}"/>'
            f'<line x1="{x:.0f}" y1="{top[1] + 10:.0f}" x2="{x:.0f}" y2="{VB_H:.0f}"/>{"".join(branches)}</g>')


def skin_track(pts, summit_idx):
    """Switchbacks up the slope left of the summit."""
    sx, sy = pts[summit_idx]
    h = HORIZON - sy
    def slope_x(y):   # x of the outline left of the summit at height y
        for j in range(summit_idx, 0, -1):
            (x1, y1), (x2, y2) = pts[j - 1], pts[j]
            if min(y1, y2) <= y <= max(y1, y2) and y1 != y2:
                return x1 + (x2 - x1) * (y - y1) / (y2 - y1)
        return sx - 0.6 * (y - sy)
    out = []
    n = 7
    for i in range(n + 1):
        t = i / n
        y = HORIZON - 40 - (h - 40) * t
        edge = slope_x(y)
        width = max(sx - edge, 30)
        x = sx - width * (0.78 if i % 2 == 0 else 0.25)
        out.append((x, y))
    out[-1] = (sx, sy + 2)
    return "M" + " L".join("%.0f %.1f" % p for p in out)


def main():
    rng = random.Random(SEED)
    r = trace(PHOTO)
    pts = outline(r, SIMPLIFY, EXAG)
    ext = extrema(pts, PROMINENCE)
    main_faces = faces(pts, ext)
    summit_idx = min(range(len(pts)), key=lambda i: pts[i][1])
    far = outline(smooth(r, 70) - 46, 10, EXAG * 0.8)
    far_poly = far + [(far[-1][0], HORIZON), (far[0][0], HORIZON)]

    def ridge_y(x):
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            if x1 <= x <= x2:
                return y1 + (y2 - y1) * (x - x1) / ((x2 - x1) or 1)
        return HORIZON
    sx, sy = pts[summit_idx]

    svg = f'''<svg class="ridge" viewBox="0 0 {VB_W:.0f} {VB_H:.0f}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
        <pattern id="hatch-h" width="12" height="12" patternUnits="userSpaceOnUse"><line x1="0" y1="6" x2="12" y2="6"/></pattern>
        <pattern id="hatch-d" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="6" x2="12" y2="6"/></pattern>
        <pattern id="hatch-far" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-60)"><line x1="0" y1="8" x2="16" y2="8"/></pattern>
        <pattern id="hatch-water" width="20" height="26" patternUnits="userSpaceOnUse"><line x1="0" y1="13" x2="20" y2="13"/></pattern>
    </defs>
    <g class="ridge-far" data-parallax="0.35">
        <polygon class="far" points="{fmt(far_poly)}"/>
    </g>
    <g class="ridge-main" data-parallax="0.75">
        {"".join('<polygon class="face face-%s" points="%s"/>' % (kind, fmt(poly)) for poly, kind in main_faces)}
        <polyline class="outline" points="{fmt(pts)}"/>
        <g class="ridge-track">
            <path d="{skin_track(pts, summit_idx)}"/>
            <g class="ridge-flag" transform="translate({sx:.0f} {sy:.1f})">
                <line x1="0" y1="0" x2="0" y2="-56"/>
                <polygon points="0,-56 34,-46 0,-36"/>
            </g>
        </g>
    </g>
    <g class="ridge-water" data-parallax="-0.4">
        <rect class="lake" x="-40" y="{HORIZON:.0f}" width="{VB_W + 80:.0f}" height="{VB_H - HORIZON + 40:.0f}"/>
        <line class="horizon" x1="-40" y1="{HORIZON:.0f}" x2="{VB_W + 40:.0f}" y2="{HORIZON:.0f}"/>
    </g>
</svg>
'''
    OUT.write_text(svg)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(svg)} bytes): {len(pts)} outline points, {len(main_faces)} faces")


if __name__ == "__main__":
    main()
