#!/usr/bin/env python3
"""Trace the mountain skyline from assets/alps-cover.jpg and write _includes/ridge.svg.

The hero drawing is generated, not hand drawn: this script finds the sky/mountain
boundary in the photo (the sky is a smooth gradient, the ridge is a hard edge),
exaggerates it vertically, and writes the layered SVG with the far ridge, the
lake reflection, the shore and the four athlete pictograms.

    python3 scripts/ridge_from_photo.py            # regenerate _includes/ridge.svg

Tweak the constants below to change the look. Requires Pillow and numpy.
"""
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "assets" / "alps-cover.jpg"
OUT = ROOT / "_includes" / "ridge.svg"

HORIZON_SRC = 512.0   # photo row where the mountains meet the lake
VB_W, VB_H = 1600.0, 1000.0
HORIZON = 620.0       # drawing row of the lake horizon
EXAG = 2.9            # vertical exaggeration of the relief
CLIMB_FROM = 700      # x where the ski tourer starts climbing


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


def to_draw(y, exag=EXAG, horizon=HORIZON):
    return horizon - (HORIZON_SRC - y) * exag


def path(ys, eps, exag=EXAG, horizon=HORIZON, close=False, x0=0, x1=None):
    x1 = len(ys) if x1 is None else x1
    pts = rdp([(x, to_draw(ys[x], exag, horizon)) for x in range(x0, x1)], eps)
    d = "M" + " L".join("%.0f %.1f" % p for p in pts)
    if close:
        d += " L%.0f %.1f L0 %.1f Z" % (VB_W, horizon, horizon)
    return d


PICTO = {
    "skier": '<path d="M-52 0 L52 0 M-48 -4 L48 -4"/><path d="M-10 -4 L-2 -22 L8 -36 M14 -4 L10 -22 L8 -36"/><path d="M8 -36 L24 -58"/><circle cx="30" cy="-66" r="7.5"/><path d="M20 -52 L38 -40 L24 -2 M20 -52 L2 -40 L-22 -2"/><path d="M16 -56 q-12 2 -10 14 L6 -40"/>',
    "swimmer": '<path d="M-70 -6 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0"/><path d="M-44 -8 L18 -12"/><circle cx="27" cy="-18" r="7.5"/><path d="M0 -12 L-12 -40 L14 -34"/><path d="M-44 -8 L-58 -2 M-44 -8 L-56 -16"/>',
    "cyclist": '<circle cx="-28" cy="-14" r="14"/><circle cx="28" cy="-14" r="14"/><path d="M-28 -14 L-6 -44 L28 -14 M-6 -44 L12 -44 M-2 -18 L-6 -44 M-2 -18 L-28 -14 M-2 -18 L28 -14"/><path d="M-10 -48 L16 -64 L12 -46"/><circle cx="24" cy="-72" r="7.5"/><path d="M-10 -48 L4 -30 L-2 -18 M-10 -48 L-2 -36"/>',
    "runner": '<circle cx="12" cy="-82" r="7.5"/><path d="M7 -72 L-2 -42"/><path d="M-2 -42 L18 -30 L10 -4 M-2 -42 L-20 -30 L-34 -8"/><path d="M4 -64 L20 -54 L26 -64 M4 -64 L-12 -56 L-6 -44"/>',
}


def main():
    r = trace(PHOTO)
    k = 70
    far = np.convolve(np.pad(r, k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), mode="valid") - 28
    k2 = 6
    climb = np.convolve(np.pad(r, k2, mode="edge"), np.ones(2 * k2 + 1) / (2 * k2 + 1), mode="valid") - 3
    summit = int(np.argmin(r))
    shore_d = "M-120 906 Q 800 934 1720 912"
    svg = f'''<svg class="ridge" viewBox="0 0 {VB_W:.0f} {VB_H:.0f}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
        <path id="ridge-climb" d="{path(climb, 2.0, x0=CLIMB_FROM, x1=summit + 1)}"/>
        <path id="ridge-shore" d="{shore_d}"/>
    </defs>
    <g class="ridge-far" data-parallax="0.35">
        <path d="{path(far, 1.2, exag=EXAG * 0.65)}" pathLength="1"/>
    </g>
    <g class="ridge-main" data-parallax="0.8">
        <path class="ridge-mass" d="{path(r, 1.6, close=True)}"/>
        <path class="ridge-line" d="{path(r, 1.6)}" pathLength="1"/>
        <g class="picto picto-skier">
            <g transform="scale(0.85)">{PICTO["skier"]}</g>
            <animateMotion dur="70s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.9;1"><mpath href="#ridge-climb"/></animateMotion>
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.86;0.9;1" dur="70s" repeatCount="indefinite"/>
        </g>
    </g>
    <g class="ridge-water" data-parallax="-0.5">
        <line class="ridge-horizon" x1="0" y1="{HORIZON:.0f}" x2="{VB_W:.0f}" y2="{HORIZON:.0f}"/>
        <path class="ridge-reflection" d="{path(r, 3.0, exag=-EXAG * 0.24)}" pathLength="1"/>
        <g class="picto picto-swimmer" transform="translate(720 {HORIZON + 125:.0f}) scale(0.8)">
            <g>{PICTO["swimmer"]}<animateTransform attributeName="transform" type="translate" values="0 0; 0 4; 0 0" dur="5s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"/></g>
        </g>
    </g>
    <g class="ridge-shore" data-parallax="1.1">
        <path class="ridge-shoreline" d="{shore_d}"/>
        <g class="picto picto-cyclist">
            <g transform="scale(0.8)">{PICTO["cyclist"]}</g>
            <animateMotion dur="34s" repeatCount="indefinite" rotate="auto" begin="-6s"><mpath href="#ridge-shore"/></animateMotion>
        </g>
        <g class="picto picto-runner">
            <g transform="scale(0.8)">{PICTO["runner"]}</g>
            <animateMotion dur="58s" repeatCount="indefinite" rotate="auto" begin="-30s"><mpath href="#ridge-shore"/></animateMotion>
        </g>
    </g>
</svg>
'''
    OUT.write_text(svg)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(svg)} bytes), summit at x={summit}")


if __name__ == "__main__":
    main()
