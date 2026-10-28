#!/usr/bin/env python3
"""Write the hero illustration, _includes/ridge.svg: a Matterhorn-like peak in monoline hatching.

The silhouette is hand-drawn below (viewBox 1600 x 1000, baseline at y=820).
Two faces: the north face in horizontal hatch, the east face in diagonal hatch,
divided by a ridge line running from the summit down to the left. One line
colour (currentColor), so the drawing follows the light and dark themes.

    python3 scripts/mountain.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "_includes" / "ridge.svg"
W, H, BASE = 1600, 1000, 820

# Outline, left to right. The Hörnli ridge climbs in steps, the summit leans
# left over the north face, the east face falls steeply and flattens out.
OUTLINE = [
    (-40, BASE), (200, 792), (330, 732), (424, 688), (468, 642), (522, 612), (592, 538),
    (642, 518), (702, 438), (742, 418), (792, 338), (822, 324), (862, 250), (878, 246),
    (902, 182), (916, 160), (928, 118), (922, 100), (934, 74), (952, 60), (974, 70),
    (990, 102), (1002, 142), (1022, 166), (1052, 232), (1072, 250), (1102, 322),
    (1126, 340), (1162, 412), (1192, 430), (1242, 502), (1272, 516), (1322, 582),
    (1372, 612), (1432, 672), (1502, 716), (1582, 772), (1640, 802), (1640, BASE),
]
SUMMIT = (952, 60)
# Ridge between the two faces: from the summit down to the base, bowing left like the Hörnli ridge seen from Zermatt.
DIVIDER = [SUMMIT, (912, 230), (846, 420), (762, 630), (690, BASE)]


def fmt(points):
    return " ".join("%.0f,%.0f" % p for p in points)


def split_faces(outline, divider):
    """Left face: outline from the left base to the summit, then down the divider.
    Right face: up the divider from the base, then the outline from the summit to the right base."""
    i = outline.index(SUMMIT)
    left = outline[:i + 1] + divider[1:]
    right = divider[::-1][:-1] + outline[i:]
    return left, right


def main():
    north, east = split_faces(OUTLINE, DIVIDER)
    svg = f'''<svg class="ridge" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
        <pattern id="hatch-h" width="13" height="13" patternUnits="userSpaceOnUse"><line x1="0" y1="6.5" x2="13" y2="6.5"/></pattern>
        <pattern id="hatch-d" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(48)"><line x1="0" y1="6.5" x2="13" y2="6.5"/></pattern>
    </defs>
    <g class="ridge-main" data-parallax="0.5">
        <polygon class="face face-north" points="{fmt(north)}"/>
        <polygon class="face face-east" points="{fmt(east)}"/>
        <polyline class="divider" points="{fmt(DIVIDER)}"/>
        <polyline class="outline" points="{fmt(OUTLINE[:-1])}" pathLength="1"/>
        <line class="baseline" x1="-40" y1="{BASE}" x2="{W + 40}" y2="{BASE}"/>
    </g>
</svg>
'''
    OUT.write_text(svg)
    print(f"wrote {OUT.name} ({len(svg)} bytes)")


if __name__ == "__main__":
    main()
