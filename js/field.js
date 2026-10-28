/* Hero signal: a band of thin streams flowing across the width, and one red
   oscilloscope trace that every so often scrambles and settles into a one-line
   drawing of a swimmer, a cyclist or a runner, then unravels back into a wave.
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

  /* One-line drawings in a unit box (x 0..1, y 0..1 downwards), facing right.
     A segment list: points, or ['c', cx, cy, r, fromDeg] for a full circle that
     starts and ends at the point at fromDeg, so the line can run around a head
     or a wheel and continue. The trace retraces limbs where it must, as a
     one-line drawing does. */
  var FIGURES = {
    swimmer: [
      [0.02, 0.70], [0.32, 0.58], [0.10, 0.42], [0.32, 0.58],
      [0.60, 0.54],
      [0.50, 0.30], [0.72, 0.22], [0.50, 0.30], [0.60, 0.54],
      ['c', 0.72, 0.50, 0.085, 160],
      [0.60, 0.54], [0.66, 0.74], [0.80, 0.80]
    ],
    cyclist: [
      ['c', 0.24, 0.74, 0.17, 180], [0.24, 0.74],
      [0.50, 0.74], [0.44, 0.46],
      [0.62, 0.58], [0.54, 0.78], [0.62, 0.58], [0.44, 0.46],
      [0.68, 0.22],
      ['c', 0.77, 0.12, 0.085, 132],
      [0.68, 0.22], [0.74, 0.44], [0.76, 0.74],
      ['c', 0.76, 0.74, 0.17, 0]
    ],
    runner: [
      [0.10, 0.96], [0.26, 0.74], [0.46, 0.56],
      [0.70, 0.64], [0.66, 0.96], [0.70, 0.64], [0.46, 0.56],
      [0.56, 0.30],
      [0.38, 0.40], [0.44, 0.54], [0.38, 0.40], [0.56, 0.30],
      ['c', 0.63, 0.15, 0.10, 115],
      [0.56, 0.30], [0.74, 0.42], [0.84, 0.28]
    ]
  };
  var ORDER = ['swimmer', 'cyclist', 'runner'];
  /* timeline: seconds of plain wave, then for each figure: morph in, hold, morph out, wave */
  var WAVE = 4.5, IN = 1.8, HOLD = 4.5, OUT = 1.6;
  var SEG = IN + HOLD + OUT + WAVE, CYCLE = WAVE + ORDER.length * SEG;

  function expand(def) {
    var pts = [];
    def.forEach(function (s) {
      if (s[0] === 'c') {
        var a0 = s[4] * Math.PI / 180;
        for (var k = 0; k <= 40; k++) {
          var a = a0 + k / 40 * Math.PI * 2;
          pts.push([s[1] + Math.cos(a) * s[3], s[2] + Math.sin(a) * s[3]]);
        }
      } else { pts.push(s); }
    });
    return pts;
  }
  function resample(pts, n) {
    var seg = [0], total = 0, i;
    for (i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(total);
    }
    var out = new Float32Array(n * 2), j = 0;
    for (i = 0; i < n; i++) {
      var d = i / (n - 1) * total;
      while (j < seg.length - 2 && seg[j + 1] < d) { j++; }
      var f = (seg[j + 1] - seg[j]) > 0 ? (d - seg[j]) / (seg[j + 1] - seg[j]) : 0;
      out[i * 2] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f;
      out[i * 2 + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
    }
    return out;
  }

  var figures = {};
  function buildFigures() {
    /* the figure sits top right on wide screens, above the name on narrow ones */
    var phone = W < 640;
    var s = phone ? Math.min(W * 0.62, H * 0.26) : Math.min(W * 0.30, H * 0.44);
    var bx = phone ? (W - s) / 2 : W * 0.62;
    var by = phone ? H * 0.08 : H * 0.10;
    ORDER.forEach(function (name) {
      var u = expand(FIGURES[name]).map(function (p) { return [bx + p[0] * s, by + p[1] * s]; });
      var pts = [[-8, u[0][1]]].concat(u, [[W + 8, u[u.length - 1][1]]]);   /* horizontal leads in and out */
      figures[name] = resample(pts, N);
    });
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) { return; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildFigures();
    draw(performance.now());
  }

  function ease(v) { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v); }
  /* which figure is forming at time t, and how far (0 wave .. 1 figure) */
  function state(t) {
    var u = t % CYCLE;
    if (u < WAVE) { return { name: null, s: 0 }; }
    u -= WAVE;
    var k = Math.floor(u / SEG), v = u - k * SEG;
    var s = v < IN ? ease(v / IN) : v < IN + HOLD ? 1 : v < IN + HOLD + OUT ? 1 - ease((v - IN - HOLD) / OUT) : 0;
    return { name: ORDER[k], s: s };
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
    var st = reduceMotion ? { name: 'runner', s: 1 } : state(t);
    var inkRGB = ink.r + ',' + ink.g + ',' + ink.b;
    var redStr = redRGB.r + ',' + redRGB.g + ',' + redRGB.b;

    /* the grey streams, calmer while a figure is up */
    var calm = 1 - 0.35 * st.s;
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

    /* the red trace: wave samples blended towards the figure samples */
    var fig = st.name ? figures[st.name] : null;
    var s = st.s, burst = Math.sin(s * Math.PI);                 /* scramble peaks mid-morph */
    var i, px, py;
    ctx.beginPath();
    for (i = 0; i < N; i++) {
      var wx = i / (N - 1) * W;
      var wy = waveY(wx, 6, t, centre, spacing, swing, ph);
      if (fig) {
        var fx = fig[i * 2], fy = fig[i * 2 + 1];
        px = wx + (fx - wx) * s;
        py = wy + (fy - wy) * s;
        /* noise while scrambling, a faint hum once settled */
        var n = Math.sin(i * 0.9 + t * 9) * Math.sin(i * 0.23 - t * 5);
        py += n * (18 * burst + 1.2 * s);
        px += Math.sin(i * 0.5 + t * 7) * 10 * burst;
      } else { px = wx; py = wy; }
      if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
    }
    /* phosphor glow, then the core line */
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(' + redStr + ',' + (0.16 * fade).toFixed(3) + ')';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = red;
    ctx.globalAlpha = 0.95 * fade;
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* the beam, running along the trace */
    if (!reduceMotion) {
      var head = ((t * 0.18) % 1) * (N - 1), hi = Math.floor(head), hf = head - hi;
      var ax, ay, bx, by;
      if (fig) {
        ax = (hi / (N - 1) * W) + (fig[hi * 2] - hi / (N - 1) * W) * s;
        ay = waveY(hi / (N - 1) * W, 6, t, centre, spacing, swing, ph) + (fig[hi * 2 + 1] - waveY(hi / (N - 1) * W, 6, t, centre, spacing, swing, ph)) * s;
        var hj = Math.min(N - 1, hi + 1);
        bx = (hj / (N - 1) * W) + (fig[hj * 2] - hj / (N - 1) * W) * s;
        by = waveY(hj / (N - 1) * W, 6, t, centre, spacing, swing, ph) + (fig[hj * 2 + 1] - waveY(hj / (N - 1) * W, 6, t, centre, spacing, swing, ph)) * s;
      } else {
        ax = hi / (N - 1) * W; ay = waveY(ax, 6, t, centre, spacing, swing, ph);
        bx = Math.min(N - 1, hi + 1) / (N - 1) * W; by = waveY(bx, 6, t, centre, spacing, swing, ph);
      }
      var hx = ax + (bx - ax) * hf, hy = ay + (by - ay) * hf;
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
