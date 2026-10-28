#!/usr/bin/env python3
"""Trace the Alps skyline from assets/alps-cover.jpg and write _includes/ridge.svg.

The hero illustration is generated: the script finds the sky/mountain boundary in
the photo (the sky is a smooth gradient, the ridge is a hard edge), exaggerates
it vertically and builds a low-poly, flat-shaded mountain from it, with far
ranges, a lake with a reflection, a shore, a sun and four athlete pictograms.

    python3 scripts/ridge_from_photo.py

Facet shades are classes f0 (lit) to f7 (shadow); their colours live in
_sass/_tokens.scss so they follow the light and dark themes.
Requires Pillow and numpy.
"""
import random
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "assets" / "alps-cover.jpg"
OUT = ROOT / "_includes" / "ridge.svg"

HORIZON_SRC = 512.0      # photo row where the mountains meet the lake
VB_W, VB_H = 1600.0, 1000.0
HORIZON = 640.0          # drawing row of the lake horizon
EXAG = 3.1               # vertical exaggeration of the relief
CLIMB_FROM = 760         # x where the ski tourer starts climbing
SEED = 7


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


def to_draw(y, exag=EXAG, horizon=HORIZON):
    return horizon - (HORIZON_SRC - y) * exag


def silhouette(ys, eps, exag, horizon, bottom):
    pts = rdp([(x, to_draw(ys[x], exag, horizon)) for x in range(len(ys))], eps)
    d = "M-40 %.1f L" % bottom + " L".join("%.0f %.1f" % p for p in pts)
    return d + " L%.0f %.1f Z" % (VB_W + 40, bottom)


def facets(ys, rng):
    """Triangulate the mountain mass between the ridge and the horizon, shade each facet."""
    xs = list(range(-40, int(VB_W) + 80, 46))
    def ridge_y(x):
        return to_draw(ys[min(max(int(x), 0), len(ys) - 1)])
    rows = []
    # row 0: the ridge itself, lightly jittered in x so the facets are not a comb
    rows.append([(x + rng.uniform(-8, 8), ridge_y(x), rng.uniform(-1, 1)) for x in xs])
    for t, jy in ((0.42, 26), (0.74, 18)):
        row = []
        for x in xs:
            ry = ridge_y(x)
            y = ry + (HORIZON - ry) * t + rng.uniform(-jy, jy)
            row.append((x + rng.uniform(-14, 14), min(y, HORIZON - 4), rng.uniform(-1, 1)))
        rows.append(row)
    rows.append([(x, HORIZON, rng.uniform(-0.4, 0.4)) for x in xs])

    light = np.array([-0.55, 0.75, 0.6]); light /= np.linalg.norm(light)
    out = []
    def shade(tri):
        p = [np.array([v[0] / 100.0, (HORIZON - v[1]) / 100.0, v[2] * 0.9]) for v in tri]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        if n[1] < 0: n = -n
        n /= (np.linalg.norm(n) or 1)
        lit = float(np.dot(n, light))               # roughly -1 .. 1
        # higher facets are lighter (snow), lower ones sit in the valley haze
        elev = (HORIZON - sum(v[1] for v in tri) / 3) / (HORIZON - 200)
        val = 0.5 - 0.42 * lit - 0.25 * elev + rng.uniform(-0.08, 0.08)
        return int(min(7, max(0, round(val * 7))))
    for a, b in zip(rows, rows[1:]):
        for i in range(len(xs) - 1):
            q = (a[i], a[i + 1], b[i + 1], b[i])
            tris = ((q[0], q[1], q[2]), (q[0], q[2], q[3])) if rng.random() < 0.5 else ((q[0], q[1], q[3]), (q[1], q[2], q[3]))
            for tri in tris:
                pts = " ".join("%.0f,%.1f" % (v[0], v[1]) for v in tri)
                out.append('<polygon class="f%d" points="%s"/>' % (shade(tri), pts))
    return "\n        ".join(out)


# Munich-72 style: thick rounded strokes, filled heads. Feet on y=0, facing right.
PICTO = {
    "skier": '<g class="gear"><path d="M-54 2 L54 -2"/><path d="M36 -40 L24 -2 M-2 -40 L-24 -2"/></g>'
             '<g class="body"><path d="M-8 -4 L0 -22 L8 -36 L24 -58 M14 -4 L10 -22 L8 -36 M18 -52 L36 -40 M18 -52 L-2 -40"/></g>'
             '<circle class="head" cx="31" cy="-68" r="9"/>',
    "swimmer": '<g class="body"><path d="M-46 -8 L18 -12 M0 -12 L-12 -40 L14 -34 M-46 -8 L-60 0 M-46 -8 L-58 -18"/></g>'
               '<circle class="head" cx="28" cy="-20" r="9"/>',
    "cyclist": '<g class="gear"><circle cx="-30" cy="-15" r="15"/><circle cx="30" cy="-15" r="15"/><path d="M-30 -15 L-6 -46 L30 -15 M-6 -46 L14 -46 M-2 -18 L-6 -46 M-2 -18 L-30 -15 M-2 -18 L30 -15"/></g>'
               '<g class="body"><path d="M-10 -50 L16 -66 L12 -46 M-10 -50 L4 -30 L-2 -18"/></g>'
               '<circle class="head" cx="25" cy="-75" r="9"/>',
    "runner": '<g class="body"><path d="M7 -72 L-2 -42 L18 -30 L10 -4 M-2 -42 L-20 -30 L-34 -8 M4 -64 L20 -54 L26 -66 M4 -64 L-12 -56 L-6 -44"/></g>'
              '<circle class="head" cx="13" cy="-84" r="9"/>',
}


def main():
    rng = random.Random(SEED)
    r = trace(PHOTO)
    summit = int(np.argmin(r))
    far1 = smooth(r, 60) - 42      # peaks above the main ridge in the low left part
    far2 = smooth(r, 120) - 70
    climb = smooth(r, 6) - 4
    climb_pts = rdp([(x, to_draw(climb[x])) for x in range(CLIMB_FROM, summit + 1)], 2.0)
    climb_d = "M" + " L".join("%.0f %.1f" % p for p in climb_pts)
    shore_d = "M-120 912 Q 800 940 1720 918"
    shore_fill = shore_d + " L1720 1100 L-120 1100 Z"
    sun_x = summit + 150
    sun_y = to_draw(far2[sun_x], EXAG * 0.72) - 6     # half the disc shows above the farthest range

    svg = f'''<svg class="ridge" viewBox="0 0 {VB_W:.0f} {VB_H:.0f}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
        <path id="ridge-climb" d="{climb_d}"/>
        <path id="ridge-shore" d="{shore_d}"/>
        <linearGradient id="ridge-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <mask id="ridge-reflection-mask"><rect x="0" y="{HORIZON:.0f}" width="{VB_W:.0f}" height="{VB_H - HORIZON:.0f}" fill="url(#ridge-fade)"/></mask>
    </defs>
    <g class="ridge-sky" data-parallax="0.2">
        <circle class="ridge-sun" cx="{sun_x:.0f}" cy="{sun_y:.0f}" r="62"/>
    </g>
    <g class="ridge-far" data-parallax="0.35">
        <path class="far2" d="{silhouette(far2, 2.5, EXAG * 0.72, HORIZON, HORIZON)}"/>
        <path class="far1" d="{silhouette(far1, 2.0, EXAG * 0.82, HORIZON, HORIZON)}"/>
    </g>
    <g class="ridge-main" data-parallax="0.8">
        {facets(r, rng)}
        <g class="picto picto-skier">
            <g transform="scale(0.72)">{PICTO["skier"]}</g>
            <animateMotion dur="70s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes="0;0.9;1"><mpath href="#ridge-climb"/></animateMotion>
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.86;0.9;1" dur="70s" repeatCount="indefinite"/>
        </g>
    </g>
    <g class="ridge-water" data-parallax="-0.5">
        <rect class="ridge-lake" x="-40" y="{HORIZON:.0f}" width="{VB_W + 80:.0f}" height="{VB_H - HORIZON + 40:.0f}"/>
        <g class="ridge-reflection" mask="url(#ridge-reflection-mask)">
            <g transform="translate(0 {1.5 * HORIZON:.0f}) scale(1 -0.5)">{facets(r, random.Random(SEED))}</g>
        </g>
        <g class="picto picto-swimmer" transform="translate(720 {HORIZON + 140:.0f}) scale(0.72)">
            <g>{PICTO["swimmer"]}<animateTransform attributeName="transform" type="translate" values="0 0; 0 5; 0 0" dur="5s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"/></g>
        </g>
    </g>
    <g class="ridge-shore" data-parallax="1.1">
        <path class="ridge-shoreland" d="{shore_fill}"/>
        <g class="picto picto-cyclist">
            <g transform="scale(0.72)">{PICTO["cyclist"]}</g>
            <animateMotion dur="34s" repeatCount="indefinite" rotate="auto" begin="-6s"><mpath href="#ridge-shore"/></animateMotion>
        </g>
        <g class="picto picto-runner">
            <g transform="scale(0.72)">{PICTO["runner"]}</g>
            <animateMotion dur="58s" repeatCount="indefinite" rotate="auto" begin="-30s"><mpath href="#ridge-shore"/></animateMotion>
        </g>
    </g>
</svg>
'''
    OUT.write_text(svg)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(svg)} bytes), summit at x={summit}")


if __name__ == "__main__":
    main()
