#!/usr/bin/env python3
"""Write the hero illustration, _includes/ridge.svg: the Matterhorn in monoline hatching.

PHOTO_OUTLINE is the mountain's skyline traced from a photograph taken from the
Domhütte (the classic view: Hörnli ridge on the left, east face on the right),
in that photo's pixel coordinates. It is scaled into the drawing, closed on a
baseline and split into two faces by the ridge that runs from the summit down
the right edge of the bright north face: north face in horizontal hatch, east
face in diagonal hatch. One line colour (currentColor), so the drawing follows
the light and dark themes.

    python3 scripts/mountain.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "_includes" / "ridge.svg"
W, H, BASE = 1600, 1000, 930
TOP = 44            # drawing row of the summit
SUMMIT_X = 1010     # drawing column of the summit; the east face runs off the right edge

# Skyline in photo pixels, left to right (clouds at the far edges left out).
PHOTO_OUTLINE = [
    (262, 642), (272, 636), (297, 592), (313, 588), (359, 556), (390, 527), (399, 512), (422, 501),
    (474, 459), (498, 427), (518, 364), (530, 354), (544, 352), (551, 342), (560, 307), (567, 235),
    (581, 226), (597, 231), (612, 217), (617, 197), (645, 190), (655, 108), (670, 75), (681, 57),
    (694, 49), (709, 29), (738, 21), (781, 28), (803, 26), (835, 52), (878, 100), (910, 119),
    (939, 146), (965, 187), (974, 221), (975, 263), (985, 265), (997, 301), (1025, 327),
    (1038, 354), (1069, 366), (1071, 380), (1108, 436), (1118, 444), (1133, 446), (1137, 452),
    (1151, 454), (1165, 448), (1226, 482), (1255, 513), (1264, 557), (1271, 556), (1278, 524),
]
# The ridge between the two faces, in photo pixels, summit first.
PHOTO_DIVIDER = [(738, 21), (706, 150), (662, 300), (628, 450), (600, 590), (566, 720), (520, 860)]


def transform():
    sx, sy = min(PHOTO_OUTLINE, key=lambda p: p[1])
    base_y = max(p[1] for p in PHOTO_OUTLINE)
    scale = (BASE - TOP) / (base_y - sy + 40)          # the trace ends a little above the baseline
    def f(p):
        return (SUMMIT_X + (p[0] - sx) * scale, TOP + (p[1] - sy) * scale)
    return f


def extend_to_base(a, b):
    """Continue the segment a->b until it meets the baseline (straight down if it would not)."""
    (x1, y1), (x2, y2) = a, b
    if y2 <= y1:
        return (x2, BASE)
    t = (BASE - y2) / (y2 - y1)
    return (x2 + (x2 - x1) * t, BASE)


def trim_to_base(points):
    """Cut a polyline where it crosses the baseline, extending the last segment if it stops short."""
    out = [points[0]]
    for a, b in zip(points, points[1:]):
        if b[1] >= BASE:
            t = (BASE - a[1]) / (b[1] - a[1])
            out.append((a[0] + (b[0] - a[0]) * t, BASE))
            return out
        out.append(b)
    out.append(extend_to_base(out[-2], out[-1]))
    return out


def fmt(points):
    return " ".join("%.0f,%.0f" % p for p in points)


def main():
    f = transform()
    outline = [f(p) for p in PHOTO_OUTLINE]
    outline = [extend_to_base(outline[1], outline[0])] + outline + [extend_to_base(outline[-2], outline[-1])]
    divider = trim_to_base([f(p) for p in PHOTO_DIVIDER])
    i = min(range(len(outline)), key=lambda k: outline[k][1])
    north = outline[:i + 1] + divider[1:]
    east = divider[::-1][:-1] + outline[i:]
    svg = f'''<svg class="ridge" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
        <pattern id="hatch-h" width="13" height="13" patternUnits="userSpaceOnUse"><line x1="0" y1="6.5" x2="13" y2="6.5"/></pattern>
        <pattern id="hatch-d" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(48)"><line x1="0" y1="6.5" x2="13" y2="6.5"/></pattern>
    </defs>
    <g class="ridge-main" data-parallax="0.5">
        <polygon class="face face-north" points="{fmt(north)}"/>
        <polygon class="face face-east" points="{fmt(east)}"/>
        <polyline class="divider" points="{fmt(divider)}"/>
        <polyline class="outline" points="{fmt(outline)}" pathLength="1"/>
        <line class="baseline" x1="-40" y1="{BASE}" x2="{W + 40}" y2="{BASE}"/>
    </g>
</svg>
'''
    OUT.write_text(svg)
    print(f"wrote {OUT.name} ({len(svg)} bytes, {len(outline)} outline points)")


if __name__ == "__main__":
    main()
