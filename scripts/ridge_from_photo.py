#!/usr/bin/env python3
"""Build the hero illustration (_includes/ridge.svg) from the Alps photo.

The photo's skyline is traced (the sky is a smooth gradient, the ridge a hard
edge) and its peaks, their positions and relative heights, become clean
triangular mountains in three depth layers: lit face, shadow face split by a
vertical under the apex, notched snow cap. A red sun, a flat lake with the
range mirrored into it, a shore band, and a red dotted ski-touring track with a
flag on the highest summit complete the scene.

    python3 scripts/ridge_from_photo.py

Colours live in _sass/_tokens.scss. Requires Pillow and numpy.
"""
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "assets" / "alps-cover.jpg"
OUT = ROOT / "_includes" / "ridge.svg"

HORIZON_SRC = 512.0
VB_W, VB_H = 1600.0, 1000.0
HORIZON = 700.0
EXAG = 4.6            # vertical exaggeration of the traced heights
SNOW = 0.3            # snow cap, as a fraction of each peak's height
FLANK_L, FLANK_R = 0.78, 0.62   # half-widths of a peak's base, per unit of height (left / right)


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


def peaks(ys, k, min_sep, min_h, exag=EXAG):
    """Local maxima of the smoothed skyline as (x, apex_y), tallest first within min_sep."""
    s = smooth(ys, k)
    h = (HORIZON_SRC - s) * exag            # drawn height above the horizon
    cand = [x for x in range(1, len(h) - 1) if h[x] >= h[x - 1] and h[x] > h[x + 1] and h[x] >= min_h]
    cand.sort(key=lambda x: -h[x])
    chosen = []
    for x in cand:
        if all(abs(x - c) >= min_sep for c in chosen):
            chosen.append(x)
    return sorted((float(x), HORIZON - float(h[x])) for x in chosen)


def fmt(points):
    return " ".join("%.0f,%.1f" % p for p in points)


def mountain(px, py, fl=FLANK_L, fr=FLANK_R, snow=SNOW, cls=""):
    """One peak: lit polygon, shadow polygon, snow cap (lit and shadow halves)."""
    h = HORIZON - py
    wl, wr = h * fl, h * fr
    base_l, base_r = (px - wl, HORIZON), (px + wr, HORIZON)
    out = [f'<polygon class="{cls}lit" points="{fmt([(px, py), base_r, base_l])}"/>',
           f'<polygon class="{cls}shadow" points="{fmt([(px, py), base_r, (px, HORIZON)])}"/>']
    if snow:
        sy = py + h * snow                       # bottom of the cap
        xl, xr = px - wl * snow, px + wr * snow  # cap corners on the flanks
        notch = h * snow * 0.32
        # notched underside: down-up-down zigzag across the cap
        cap = [(px, py), (xr, sy), (xr - (xr - px) * 0.5, sy - notch), (px, sy + notch * 0.2),
               (px - (px - xl) * 0.5, sy - notch), (xl, sy)]
        out.append(f'<polygon class="{cls}snow" points="{fmt(cap)}"/>')
        cap_r = [(px, py), (xr, sy), (xr - (xr - px) * 0.5, sy - notch), (px, sy + notch * 0.2)]
        out.append(f'<polygon class="{cls}snow-shadow" points="{fmt(cap_r)}"/>')
    return "".join(out)


def skin_track(px, py, fl=FLANK_L):
    """Switchbacks up the lit face to the apex."""
    h = HORIZON - py
    pts = []
    n = 7
    for i in range(n + 1):
        t = i / n
        y = HORIZON - 30 - (h - 30) * t
        width = fl * (y - py)                  # lit face width at this height
        x = px - width * (0.72 if i % 2 == 0 else 0.22)
        pts.append((x, y))
    pts[-1] = (px, py + 2)
    return "M" + " L".join("%.0f %.1f" % p for p in pts)


def main():
    r = trace(PHOTO)
    main_pk = peaks(r, 18, 170, 190)
    mid_pk = [(x - 90, y + (HORIZON - y) * 0.42) for x, y in peaks(r, 40, 120, 120)]
    far_pk = [(x + 60, y + (HORIZON - y) * 0.62) for x, y in peaks(smooth(r, 30) - 20, 70, 200, 90)]
    summit = min(main_pk, key=lambda p: p[1])

    def layer(pks, cls, fl, fr, snow):
        return "".join(mountain(px, py, fl, fr, snow, cls) for px, py in sorted(pks, key=lambda p: -p[1]))

    sun_x, sun_y = summit[0] + 250, summit[1] + 100
    shore_d = "M-120 920 Q 800 948 1720 926 L1720 1100 L-120 1100 Z"
    svg = f'''<svg class="ridge" viewBox="0 0 {VB_W:.0f} {VB_H:.0f}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
        <linearGradient id="ridge-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <mask id="ridge-reflection-mask"><rect x="-40" y="{HORIZON:.0f}" width="{VB_W + 80:.0f}" height="{VB_H - HORIZON:.0f}" fill="url(#ridge-fade)"/></mask>
    </defs>
    <g class="ridge-sky" data-parallax="0.15">
        <circle class="ridge-sun" cx="{sun_x:.0f}" cy="{sun_y:.0f}" r="78"/>
    </g>
    <g class="ridge-far2" data-parallax="0.3">{layer(far_pk, "far2-", 1.6, 1.3, 0)}</g>
    <g class="ridge-far1" data-parallax="0.45">{layer(mid_pk, "far1-", 1.05, 0.85, 0)}</g>
    <g class="ridge-main" data-parallax="0.75">
        {layer(main_pk, "", FLANK_L, FLANK_R, SNOW)}
        <g class="ridge-track">
            <path d="{skin_track(summit[0], summit[1])}"/>
            <g class="ridge-flag" transform="translate({summit[0]:.0f} {summit[1]:.1f})">
                <line x1="0" y1="0" x2="0" y2="-58"/>
                <polygon points="0,-58 36,-47 0,-36"/>
            </g>
        </g>
    </g>
    <g class="ridge-water" data-parallax="-0.4">
        <rect class="ridge-lake" x="-40" y="{HORIZON:.0f}" width="{VB_W + 80:.0f}" height="{VB_H - HORIZON + 40:.0f}"/>
        <g class="ridge-reflection" mask="url(#ridge-reflection-mask)">
            <g transform="translate(0 {HORIZON:.0f}) scale(1 -0.4) translate(0 {-HORIZON:.0f})">{layer(main_pk, "", FLANK_L, FLANK_R, 0)}</g>
        </g>
    </g>
    <g class="ridge-shore" data-parallax="1"><path d="{shore_d}"/></g>
</svg>
'''
    OUT.write_text(svg)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(svg)} bytes): main peaks {[(int(x), int(HORIZON - y)) for x, y in main_pk]}, mid {len(mid_pk)}, far {len(far_pk)}")


if __name__ == "__main__":
    main()
