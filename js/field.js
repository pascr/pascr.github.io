/* Hero signal: a band of thin streams flowing across the width. Every so often
   the streams gather into the strokes of a drawing (window.HERO_STROKES, traced
   by scripts/trace_strokes.py), hold, and release back into the wave.
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
  var M = 200;                                   /* samples per line */

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

  /* the drawing, fitted into the hero: one target per line, sorted by height so lines barely cross */
  var targets = [], lines = 16, redLine = 6, scale = 1;
  function buildTargets() {
    targets = [];
    if (!ART || !ART.strokes.length) { lines = 16; redLine = 6; return; }
    var phone = W < 640;
    /* the drawing sits in the free space top right of the name on wide screens, above it on phones */
    var maxW = phone ? W * 0.94 : W * 0.50, maxH = phone ? H * 0.22 : H * 0.30;
    var bw = maxW, bh = bw * ART.height / ART.width;
    if (bh > maxH) { bh = maxH; bw = bh * ART.width / ART.height; }
    scale = bw / ART.width;
    var bx = phone ? (W - bw) / 2 : W * 0.97 - bw, by = phone ? H * 0.16 : H * 0.03 + (maxH - bh) / 2;
    var fitted = ART.strokes.filter(function (s) { return s.length >= 2; }).map(function (s, idx) {
      var pts = smooth(s.map(function (p) { return [bx + p[0] * scale, by + p[1] * scale, p[2] * scale]; }), 6);
      var meanY = 0; pts.forEach(function (p) { meanY += p[1]; }); meanY /= pts.length;
      return { pts: resample(pts, M), y: meanY, idx: idx };
    });
    fitted.sort(function (a, b) { return a.y - b.y; });
    targets = fitted;
    lines = Math.max(16, fitted.length);
    redLine = 0;
    fitted.forEach(function (f, k) { if (f.idx === 0) { redLine = k; } });   /* the longest stroke goes red */
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

  /* timeline: plain wave, then the drawing forms, holds and dissolves */
  var WAVE = 5, IN = 2.6, HOLD = 8, OUT = 2.4, CYCLE = WAVE + IN + HOLD + OUT;
  function ease(v) { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); }
  function state(t) {
    if (!targets.length) { return 0; }
    var u = t % CYCLE;
    if (u < WAVE) { return 0; }
    u -= WAVE;
    return u < IN ? ease(u / IN) : u < IN + HOLD ? 1 : 1 - ease((u - IN - HOLD) / OUT);
  }

  function waveY(x, k, t, centre, spacing, swing, ph) {
    var env = Math.sin(x / W * Math.PI);
    var amp = swing * env * (1 - k * 0.03);
    return centre + k * spacing
         + Math.sin(x * 0.011 + k * 0.6 + t * 0.35 + ph) * amp * 0.5
         + Math.sin(x * 0.027 - k * 0.3 - t * 0.22) * amp * 0.25
         + Math.sin(x * 0.0045 + k * 0.9 + t * 0.12) * amp * 0.35;
  }

  var px = new Float32Array(M), py = new Float32Array(M), pw = new Float32Array(M);
  function draw(now) {
    var t = (now - t0) / 1000;
    var fade = reduceMotion ? 1 : Math.min(1, (now - born) / 1600);
    ctx.clearRect(0, 0, W, H);

    var s = reduceMotion ? 1 : state(t);
    var burst = Math.sin(s * Math.PI);
    var centre = H * ((W < 640 ? 0.36 : 0.44) + (pointer.y - 0.5) * 0.04);
    var spacing = (W < 640 ? 7 : 9) * 16 / lines;
    var swing = Math.min(150, H * 0.17) * (1 - 0.4 * s);
    var ph = (pointer.x - 0.5) * 0.8;
    var inkRGB = ink.r + ',' + ink.g + ',' + ink.b;
    var redStr = redRGB.r + ',' + redRGB.g + ',' + redRGB.b;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    for (var k = 0; k < lines; k++) {
      var isRed = k === redLine;
      var depth = k / (lines - 1);
      var tgt = targets[k] ? targets[k].pts : null;
      var waveW = isRed ? 1.6 : 0.8 + 0.6 * depth;
      var waveA = isRed ? 0.95 : 0.14 + 0.3 * depth;
      var i;
      for (i = 0; i < M; i++) {
        var wx = i / (M - 1) * W, wy = waveY(wx, k, t, centre, spacing, swing, ph);
        if (tgt && s > 0) {
          var n = Math.sin(i * 0.9 + k + t * 9) * Math.sin(i * 0.23 - t * 5);
          px[i] = wx + (tgt[i * 3] - wx) * s + Math.sin(i * 0.5 + k * 2 + t * 7) * 8 * burst;
          py[i] = wy + (tgt[i * 3 + 1] - wy) * s + n * (12 * burst + 0.6 * s);
          pw[i] = waveW + (Math.max(0.9, tgt[i * 3 + 2]) - waveW) * s;
        } else { px[i] = wx; py[i] = wy; pw[i] = waveW; }
      }
      /* lines without a stroke fade away while the drawing is up */
      var alpha = (tgt ? waveA + (0.92 - waveA) * s : waveA * (1 - s)) * fade;
      if (alpha < 0.01) { continue; }
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
      if (!tgt || s === 0) {
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
