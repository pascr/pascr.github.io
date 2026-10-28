/* Hero signal: a band of thin streams flowing across the width, and one red
   oscilloscope trace that every so often scrambles and settles into a single
   brush line drawing the triathlon, swimmer, cyclist and runner joined by
   swooshes, holds, then unravels back into a wave.
   Follows the theme, drifts with the pointer, renders a single frame when
   reduced motion is requested, pauses off screen or in a hidden tab. */
(function () {
  'use strict';
  var canvas = document.querySelector('[data-field]');
  if (!canvas || !canvas.getContext) { return; }
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1;
  var ink = { r: 21, g: 19, b: 15 }, red = '#d9230f', redRGB = { r: 217, g: 35, b: 15 };
  var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  var running = false, visible = true, raf = 0, t0 = performance.now(), born = t0;
  var N = 520;                                   /* samples along the red trace */

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

  /* The triathlon as one brush line, in a 300 x 100 strip (y down), left to right:
   swimmer, swoosh, cyclist, swoosh, runner. Each point is [x, y, pressure];
   pressure 0..1 drives the stroke width, near 0 for the connecting swooshes.
   ['circle', cx, cy, r, fromDeg, toDeg, pressure] draws a wheel. */
  var STRIP = [
  [0, 72, 0.05], [8, 68, 0.3], [12, 60, 0.5], [16, 67, 0.45],                     /* kick */
  [30, 63, 0.75], [48, 59, 0.9], [66, 55, 0.8], [78, 53, 0.55],                    /* body */
  [78, 44, 0.45], [82, 34, 0.75], [94, 29, 0.85], [106, 36, 0.6], [110, 48, 0.3],  /* recovery arm over the head */
  [102, 50, 0.4], [95, 45, 0.6], [87, 49, 0.65], [89, 57, 0.55], [98, 60, 0.4],    /* head */
  [108, 63, 0.7], [124, 67, 0.95], [138, 69, 0.5], [146, 70, 0.15],                /* forward arm */
  [152, 76, 0.08],                                                                 /* swoosh */
  ['circle', 166, 80, 16, 180, 660, 0.55],                                       /* rear wheel */
  [182, 84, 0.2], [190, 90, 0.4],                                                /* chain stay to the foot */
  [196, 70, 0.85], [184, 60, 0.9],                                               /* shin up, thigh back to the saddle */
  [190, 46, 0.95], [200, 36, 1.0], [210, 31, 0.7],                               /* back sweep */
  [214, 25, 0.4], [221, 27, 0.6], [222, 34, 0.6], [216, 37, 0.4],                /* head */
  [218, 45, 0.7], [224, 55, 0.6], [226, 60, 0.35],                               /* arm to the bars */
  [222, 70, 0.3], [218, 80, 0.25], [228, 94, 0.2],                               /* fork, spoke */
  ['circle', 216, 80, 16, 60, 420, 0.55],                                        /* front wheel */
  [238, 96, 0.1], [246, 98, 0.08],                                               /* swoosh */
  [252, 86, 0.6], [258, 74, 0.8], [262, 62, 0.9],                                /* rear leg to the hip */
  [268, 48, 1.0], [274, 36, 0.8],                                                /* torso */
  [279, 28, 0.4], [286, 29, 0.6], [287, 36, 0.6], [281, 39, 0.4],                /* head */
  [284, 46, 0.5], [293, 42, 0.7], [298, 33, 0.3],                                /* front arm */
  [288, 52, 0.3], [276, 56, 0.6], [264, 64, 0.6],                                /* chest down to the hip */
  [276, 74, 0.9], [288, 86, 0.8], [296, 98, 0.4], [300, 100, 0.05]               /* front leg, lead-out */
];
  function expandStrip(def) {
  var out = [];
  def.forEach(function (s) {
    if (s[0] === 'circle') {
      var a0 = s[4] * Math.PI / 180, a1 = s[5] * Math.PI / 180, n = 28;
      for (var k = 0; k <= n; k++) {
        var a = a0 + (a1 - a0) * k / n, u = k / n;
        out.push([s[1] + Math.cos(a) * s[3], s[2] + Math.sin(a) * s[3], s[6] * (0.45 + 0.55 * Math.sin(u * Math.PI))]);
      }
    } else { out.push(s); }
  });
  return out;
}
/* centripetal Catmull-Rom: smooth, and it does not loop at hairpins */
  function smoothStrip(raw, sub) {
  var pts = [raw[0]];
  for (var d = 1; d < raw.length; d++) {
    var prev = pts[pts.length - 1];
    if (Math.hypot(raw[d][0] - prev[0], raw[d][1] - prev[1]) > 0.6) { pts.push(raw[d]); }
  }
  var out = [], n = pts.length;
  function tj(ti, pa, pb) { return ti + Math.sqrt(Math.hypot(pb[0] - pa[0], pb[1] - pa[1])); }
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

  /* the strip, smoothed and resampled by arc length into N samples of x, y, pressure */
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
  var fig = null, WMAX = 8;
  function buildFigure() {
    /* the strip runs above the name on wide screens, and above it on phones too, smaller */
    var phone = W < 640;
    var bw = phone ? W * 0.96 : W * 0.82, bh = bw / 3;
    var bx = phone ? W * 0.02 : W * 0.14, by = phone ? H * 0.17 : H * 0.02;
    var pts = smoothStrip(expandStrip(STRIP), 8).map(function (p) { return [bx + p[0] / 300 * bw, by + p[1] / 100 * bh, p[2]]; });
    fig = resample(pts, N);
    WMAX = Math.max(5, Math.min(10, bw / 130));
  }
  /* timeline: plain wave, then the strip forms, holds and dissolves */
  var WAVE = 5, IN = 2.4, HOLD = 7, OUT = 2.2, CYCLE = WAVE + IN + HOLD + OUT;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) { return; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildFigure();
    draw(performance.now());
  }

  function ease(v) { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); }
  /* 0 wave .. 1 strip */
  function state(t) {
    var u = t % CYCLE;
    if (u < WAVE) { return 0; }
    u -= WAVE;
    return u < IN ? ease(u / IN) : u < IN + HOLD ? 1 : 1 - ease((u - IN - HOLD) / OUT);
  }

  function waveY(x, k, t, centre, spacing, swing, ph) {
    var env = Math.sin(x / W * Math.PI);
    var amp = swing * env * (1 - k * 0.035);
    return centre + k * spacing
         + Math.sin(x * 0.011 + k * 0.6 + t * 0.35 + ph) * amp * 0.5
         + Math.sin(x * 0.027 - k * 0.3 - t * 0.22) * amp * 0.25
         + Math.sin(x * 0.0045 + k * 0.9 + t * 0.12) * amp * 0.35;
  }

  function draw(now) {
    var t = (now - t0) / 1000;
    var fade = reduceMotion ? 1 : Math.min(1, (now - born) / 1600);
    ctx.clearRect(0, 0, W, H);

    var lines = W < 640 ? 12 : 16;
    var centre = H * ((W < 640 ? 0.36 : 0.44) + (pointer.y - 0.5) * 0.04);
    var spacing = W < 640 ? 7 : 9;
    var swing = Math.min(150, H * 0.17);
    var ph = (pointer.x - 0.5) * 0.8;
    var s = reduceMotion ? 1 : state(t);
    var inkRGB = ink.r + ',' + ink.g + ',' + ink.b;
    var redStr = redRGB.r + ',' + redRGB.g + ',' + redRGB.b;

    /* the grey streams, calmer while a figure is up */
    var calm = 1 - 0.4 * s;
    for (var k = 0; k < lines; k++) {
      if (k === 6) { continue; }
      var depth = k / (lines - 1);
      ctx.beginPath();
      ctx.lineWidth = 0.8 + 0.6 * depth;
      ctx.strokeStyle = 'rgba(' + inkRGB + ',' + ((0.14 + 0.3 * depth) * fade).toFixed(3) + ')';
      for (var x = 0; x <= W; x += 4) {
        var y = waveY(x, k, t, centre, spacing, swing * calm, ph);
        if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }

    /* the red trace: wave samples blended towards the strip, drawn as a brush line */
    var burst = Math.sin(s * Math.PI);                 /* scramble peaks mid-morph */
    var i, px = new Float32Array(N), py = new Float32Array(N), pw = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var wx = i / (N - 1) * W;
      var wy = waveY(wx, 6, t, centre, spacing, swing, ph);
      var fx = fig[i * 3], fy = fig[i * 3 + 1], pr = fig[i * 3 + 2];
      var n = Math.sin(i * 0.9 + t * 9) * Math.sin(i * 0.23 - t * 5);
      px[i] = wx + (fx - wx) * s + Math.sin(i * 0.5 + t * 7) * 8 * burst;
      py[i] = wy + (fy - wy) * s + n * (14 * burst + 0.8 * s);
      pw[i] = 1.7 + ((1.2 + (WMAX - 1.2) * pr) - 1.7) * s;
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    /* phosphor glow */
    ctx.beginPath();
    for (i = 0; i < N; i++) { if (i) { ctx.lineTo(px[i], py[i]); } else { ctx.moveTo(px[i], py[i]); } }
    ctx.strokeStyle = 'rgba(' + redStr + ',' + (0.14 * fade).toFixed(3) + ')';
    ctx.lineWidth = 6 + WMAX * s;
    ctx.stroke();
    /* core, with pressure */
    ctx.strokeStyle = red;
    ctx.globalAlpha = 0.95 * fade;
    for (i = 0; i < N - 1; i++) {
      ctx.lineWidth = (pw[i] + pw[i + 1]) / 2;
      ctx.beginPath(); ctx.moveTo(px[i], py[i]); ctx.lineTo(px[i + 1], py[i + 1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* the beam, running along the trace */
    if (!reduceMotion) {
      var head = ((t * 0.12) % 1) * (N - 1), hi = Math.floor(head), hf = head - hi, hj = Math.min(N - 1, hi + 1);
      var hx = px[hi] + (px[hj] - px[hi]) * hf, hy = py[hi] + (py[hj] - py[hi]) * hf;
      ctx.fillStyle = 'rgba(' + redStr + ',' + (0.25 * fade).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = red;
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
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
