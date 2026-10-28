/* Hero signal: a band of thin streams flowing across the width. Inside the band,
   one after the other like the legs of a triathlon, the swimmer, the cyclist and
   the runner surface: each stroke of the drawing (window.HERO_STROKES, traced by
   scripts/trace_strokes.py, split into three figures by position) is carried by
   one stream, which keeps flowing on both sides and bends into the stroke where
   the figure is, then lets go.
   Follows the theme, drifts with the pointer, renders one frame when reduced
   motion is requested, pauses off screen or in a hidden tab. */
(function () {
  'use strict';
  var canvas = document.querySelector('[data-field]');
  if (!canvas || !canvas.getContext) { return; }
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ART = window.HERO_STROKES || null;

  var W = 0, H = 0, dpr = 1;
  var ink = { r: 21, g: 19, b: 15 }, red = '#d9230f', redRGB = { r: 217, g: 35, b: 15 };
  var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  var running = false, visible = true, raf = 0, t0 = performance.now(), born = t0;
  var M = 240;                                   /* samples per line */

  function hexToRgb(h) {
    h = h.trim();
    if (h[0] === '#' && h.length === 7) {
      return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
    }
    var m = /rgba?\(([^)]+)\)/.exec(h);
    if (m) { var p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2] }; }
    return null;
  }
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ink = hexToRgb(cs.getPropertyValue('--ink')) || ink;
    red = cs.getPropertyValue('--red').trim() || red;
    redRGB = hexToRgb(red) || redRGB;
  }

  /* smooth a stroke (centripetal Catmull-Rom on x, y and width) */
  function smooth(raw, sub) {
    var pts = [raw[0]];
    for (var d = 1; d < raw.length; d++) {
      var prev = pts[pts.length - 1];
      if (Math.hypot(raw[d][0] - prev[0], raw[d][1] - prev[1]) > 0.5) { pts.push(raw[d]); }
    }
    if (pts.length === 1) { pts.push([pts[0][0] + 0.6, pts[0][1], pts[0][2]]); }
    if (pts.length < 3) { return pts; }
    var out = [], n = pts.length;
    function tj(ti, a, b) { return ti + Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])); }
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      var t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
      if (t1 === t0) { t1 = t0 + 1e-3; } if (t2 === t1) { t2 = t1 + 1e-3; } if (t3 === t2) { t3 = t2 + 1e-3; }
      for (var k = 0; k < sub; k++) {
        var t = t1 + (t2 - t1) * k / sub, q = [];
        for (var c = 0; c < 3; c++) {
          var a1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
          var a2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
          var a3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
          var b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
          var b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
          q[c] = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
        }
        out.push(q);
      }
    }
    out.push(pts[n - 1]);
    return out;
  }
  /* resample a stroke by arc length into n samples of x, y, width */
  function resample(pts, n) {
    var seg = [0], total = 0, i;
    for (i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(total);
    }
    var out = new Float32Array(n * 3), j = 0;
    for (i = 0; i < n; i++) {
      var d = i / (n - 1) * total;
      while (j < seg.length - 2 && seg[j + 1] < d) { j++; }
      var f = (seg[j + 1] - seg[j]) > 0 ? (d - seg[j]) / (seg[j + 1] - seg[j]) : 0;
      out[i * 3] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f;
      out[i * 3 + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
      out[i * 3 + 2] = pts[j][2] + (pts[j + 1][2] - pts[j][2]) * f;
    }
    return out;
  }

  /* The drawing split into figures by horizontal position (1-D k-means on the
     strokes' centres), each fitted into the same box inside the band. A stroke is
     looked up by the x of a sample: inside the stroke's span it maps along the
     stroke's arc length, so the stream bends into it and out again. */
  var figures = [], lines = 16, redLine = 6, FIGS = 3, M2 = 160;
  function buildTargets() {
    figures = [];
    if (!ART || !ART.strokes.length) { lines = 16; redLine = 6; return; }
    var strokes = ART.strokes.filter(function (st) { return st.length >= 2; });
    var cx = strokes.map(function (st) { var m = 0; st.forEach(function (p) { m += p[0]; }); return m / st.length; });
    var centres = [ART.width / 6, ART.width / 2, ART.width * 5 / 6], label = [], it, i, k;
    for (it = 0; it < 24; it++) {
      label = cx.map(function (x) { var best = 0; for (k = 1; k < FIGS; k++) { if (Math.abs(x - centres[k]) < Math.abs(x - centres[best])) { best = k; } } return best; });
      for (k = 0; k < FIGS; k++) {
        var sum = 0, n = 0;
        for (i = 0; i < cx.length; i++) { if (label[i] === k) { sum += cx[i]; n++; } }
        if (n) { centres[k] = sum / n; }
      }
    }
    var phone = W < 640;
    var band = H * (phone ? 0.36 : 0.44);
    var maxW = phone ? W * 0.7 : W * 0.30, maxH = phone ? H * 0.2 : H * 0.34;
    var fx = phone ? W * 0.5 : W * 0.80, fy = band + (phone ? 40 : 70);
    for (k = 0; k < FIGS; k++) {
      var group = [];
      for (i = 0; i < strokes.length; i++) { if (label[i] === k) { group.push(strokes[i]); } }
      if (!group.length) { continue; }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      group.forEach(function (st) { st.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); });
      var gw = x1 - x0, gh = y1 - y0;
      var sc = Math.min(maxW / gw, maxH / gh);
      var ox = fx - gw * sc / 2, oy = fy - gh * sc / 2;
      var fitted = group.map(function (st) {
        var pts = smooth(st.map(function (p) { return [ox + (p[0] - x0) * sc, oy + (p[1] - y0) * sc, Math.max(1.2, p[2] * sc * 1.15)]; }), 6);
        var arr = resample(pts, M2), minx = Infinity, maxx = -Infinity, meany = 0, len = 0;
        for (i = 0; i < M2; i++) {
          minx = Math.min(minx, arr[i * 3]); maxx = Math.max(maxx, arr[i * 3]); meany += arr[i * 3 + 1];
          if (i) { len += Math.hypot(arr[i * 3] - arr[i * 3 - 3], arr[i * 3 + 1] - arr[i * 3 - 2]); }
        }
        return { pts: arr, x0: minx, x1: maxx, y: meany / M2, len: len };
      });
      fitted.sort(function (p, q) { return p.y - q.y; });
      lines = Math.max(16, fitted.length);
      /* spread the strokes over the band's lines by height, longest stroke on the red line */
      var byLine = {};
      fitted.forEach(function (f, j) { byLine[fitted.length === 1 ? redLine : Math.round(j * (lines - 1) / (fitted.length - 1))] = f; });
      var longest = fitted.reduce(function (p, q) { return q.len > p.len ? q : p; }, fitted[0]);
      var lk = Object.keys(byLine).filter(function (key) { return byLine[key] === longest; })[0];
      if (lk !== undefined && +lk !== redLine) { var tmp = byLine[redLine]; byLine[redLine] = longest; if (tmp) { byLine[lk] = tmp; } else { delete byLine[lk]; } }
      figures.push(byLine);
    }
  }
  /* stroke target for a sample at screen x: inside the span it follows the arc, outside it holds the end */
  function strokeAt(f, x, out) {
    var u = (x - f.x0) / Math.max(1, f.x1 - f.x0);
    var dist = u < 0 ? (f.x0 - x) : u > 1 ? (x - f.x1) : 0;
    u = Math.min(1, Math.max(0, u));
    var fi = u * (M2 - 1), i0 = Math.floor(fi), i1 = Math.min(M2 - 1, i0 + 1), ft = fi - i0;
    out[0] = f.pts[i0 * 3] + (f.pts[i1 * 3] - f.pts[i0 * 3]) * ft;
    out[1] = f.pts[i0 * 3 + 1] + (f.pts[i1 * 3 + 1] - f.pts[i0 * 3 + 1]) * ft;
    out[2] = f.pts[i0 * 3 + 2] + (f.pts[i1 * 3 + 2] - f.pts[i0 * 3 + 2]) * ft;
    return dist;
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) { return; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTargets();
    draw(performance.now());
  }

  /* timeline: wave, then each figure surfaces, holds and sinks, with a breath of wave between */
  var WAVE = 3, IN = 1.8, HOLD = 4.2, OUT = 1.6, GAP = 1.6;
  var LEG = IN + HOLD + OUT + GAP;
  function ease(v) { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); }
  function state(t) {
    if (!figures.length) { return { fig: null, s: 0 }; }
    var cycle = WAVE + figures.length * LEG, u = t % cycle;
    if (u < WAVE) { return { fig: null, s: 0 }; }
    u -= WAVE;
    var k = Math.floor(u / LEG), v = u - k * LEG;
    var s = v < IN ? ease(v / IN) : v < IN + HOLD ? 1 : v < IN + HOLD + OUT ? 1 - ease((v - IN - HOLD) / OUT) : 0;
    return { fig: figures[k], s: s };
  }

  function waveY(x, k, t, centre, spacing, swing, ph) {
    var env = Math.sin(x / W * Math.PI);
    var amp = swing * env * (1 - k * 0.03);
    return centre + k * spacing
         + Math.sin(x * 0.011 + k * 0.6 + t * 0.35 + ph) * amp * 0.5
         + Math.sin(x * 0.027 - k * 0.3 - t * 0.22) * amp * 0.25
         + Math.sin(x * 0.0045 + k * 0.9 + t * 0.12) * amp * 0.35;
  }

  var px = new Float32Array(M), py = new Float32Array(M), pw = new Float32Array(M), tg = [0, 0, 0];
  function draw(now) {
    var t = (now - t0) / 1000;
    var fade = reduceMotion ? 1 : Math.min(1, (now - born) / 1600);
    ctx.clearRect(0, 0, W, H);

    var st = reduceMotion ? { fig: figures[2] || figures[0] || null, s: 1 } : state(t);
    var s = st.s, burst = Math.sin(s * Math.PI);
    var centre = H * ((W < 640 ? 0.36 : 0.44) + (pointer.y - 0.5) * 0.04);
    var spacing = (W < 640 ? 7 : 9) * 16 / lines;
    var swing = Math.min(150, H * 0.17);
    var ph = (pointer.x - 0.5) * 0.8;
    var margin = W < 640 ? 60 : 110;                  /* how far outside a stroke the stream still bends */
    var inkRGB = ink.r + ',' + ink.g + ',' + ink.b;
    var redStr = redRGB.r + ',' + redRGB.g + ',' + redRGB.b;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    for (var k = 0; k < lines; k++) {
      var isRed = k === redLine;
      var depth = k / (lines - 1);
      var f = st.fig ? st.fig[k] : null;
      var waveW = isRed ? 1.6 : 0.8 + 0.6 * depth;
      var waveA = isRed ? 0.95 : 0.14 + 0.3 * depth;
      var i, shaped = false;
      var exitX = W * 0.92, diveFrom = W * 0.78;
      for (i = 0; i < M; i++) {
        var wx = i / (M - 1) * W, wy = waveY(wx, k, t, centre, spacing, swing, ph);
        if (isRed && wx > diveFrom) {
          /* the red trace leaves the band and dives to the bottom right, where the page's line begins */
          var dv = Math.min(1, (wx - diveFrom) / (exitX - diveFrom)); dv = dv * dv * (3 - 2 * dv);
          wy = wy + (H + 4 - wy) * dv;
          wx = Math.min(wx, exitX);
        }
        if (f && s > 0) {
          var dist = strokeAt(f, wx, tg);
          var w = s * (dist >= margin ? 0 : 1 - dist / margin);
          w = w * w * (3 - 2 * w);
          if (w > 0) {
            shaped = true;
            var n = Math.sin(i * 0.9 + k + t * 9) * Math.sin(i * 0.23 - t * 5);
            px[i] = wx + (tg[0] - wx) * w + Math.sin(i * 0.5 + k * 2 + t * 7) * 6 * burst * w;
            py[i] = wy + (tg[1] - wy) * w + n * (10 * burst + 0.5 * s) * w;
            pw[i] = waveW + (tg[2] - waveW) * w;
            continue;
          }
        }
        px[i] = wx; py[i] = wy; pw[i] = waveW;
      }
      var alpha = (f ? waveA + (0.92 - waveA) * s : waveA) * fade;
      var color = isRed ? red : 'rgba(' + inkRGB + ',' + alpha.toFixed(3) + ')';
      if (isRed) {
        ctx.beginPath();
        for (i = 0; i < M; i++) { if (i) { ctx.lineTo(px[i], py[i]); } else { ctx.moveTo(px[i], py[i]); } }
        ctx.strokeStyle = 'rgba(' + redStr + ',' + (0.14 * fade).toFixed(3) + ')';
        ctx.lineWidth = 6 + 4 * s;
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }
      ctx.strokeStyle = color;
      if (!shaped) {
        ctx.beginPath();
        for (i = 0; i < M; i++) { if (i) { ctx.lineTo(px[i], py[i]); } else { ctx.moveTo(px[i], py[i]); } }
        ctx.lineWidth = waveW;
        ctx.stroke();
      } else {
        /* varying width: batch segments by quantised width */
        var levels = 6, lo = Infinity, hi = -Infinity;
        for (i = 0; i < M; i++) { if (pw[i] < lo) { lo = pw[i]; } if (pw[i] > hi) { hi = pw[i]; } }
        var span = Math.max(hi - lo, 0.01);
        for (var q = 0; q < levels; q++) {
          ctx.beginPath();
          var any = false;
          for (i = 0; i < M - 1; i++) {
            var lv = Math.min(levels - 1, Math.floor((((pw[i] + pw[i + 1]) / 2) - lo) / span * levels));
            if (lv !== q) { continue; }
            ctx.moveTo(px[i], py[i]); ctx.lineTo(px[i + 1], py[i + 1]); any = true;
          }
          if (any) { ctx.lineWidth = lo + span * (q + 0.5) / levels; ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;

      if (isRed && !reduceMotion) {
        var head = ((t * 0.12) % 1) * (M - 1), hi2 = Math.floor(head), hf = head - hi2, hj = Math.min(M - 1, hi2 + 1);
        var hx = px[hi2] + (px[hj] - px[hi2]) * hf, hy = py[hi2] + (py[hj] - py[hi2]) * hf;
        ctx.fillStyle = 'rgba(' + redStr + ',' + (0.25 * fade).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = red; ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function loop(now) {
    if (!running) { return; }
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    draw(now);
    raf = window.requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduceMotion || !visible || document.hidden) { return; }
    running = true;
    raf = window.requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
  }

  var host = canvas.closest('[data-hero]') || canvas.parentElement;
  host.addEventListener('pointermove', function (e) {
    var r = host.getBoundingClientRect();
    pointer.tx = (e.clientX - r.left) / r.width;
    pointer.ty = (e.clientY - r.top) / r.height;
  });
  host.addEventListener('pointerleave', function () { pointer.tx = 0.5; pointer.ty = 0.5; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) { start(); } else { stop(); }
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); } else { start(); } });
  if ('ResizeObserver' in window) { new ResizeObserver(resize).observe(canvas); } else { window.addEventListener('resize', resize); }
  new MutationObserver(function () { readColors(); if (!running) { draw(performance.now()); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); if (!running) { draw(performance.now()); } });

  readColors();
  resize();
  start();
})();
