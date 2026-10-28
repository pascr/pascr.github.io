/* Hero relief: animated topographic contours drawn with marching squares over
   a drifting noise field. Reacts to the pointer, follows the theme, freezes
   when reduced motion is requested, pauses when off screen. */
(function () {
  'use strict';
  var canvas = document.querySelector('[data-topo]');
  if (!canvas || !canvas.getContext) { return; }
  var ctx = canvas.getContext('2d');
  var fallback = document.querySelector('[data-topo-fallback]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Value noise with smooth interpolation, 3D so time is a third axis. */
  var P = new Uint8Array(512);
  (function seed() {
    var p = [], i, j, t;
    for (i = 0; i < 256; i++) { p[i] = i; }
    var s = 1337;
    for (i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      j = s % (i + 1); t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (i = 0; i < 512; i++) { P[i] = p[i & 255]; }
  })();
  function hash(x, y, z) { return P[(P[(P[x & 255] + y) & 255] + z) & 255] / 255; }
  function fade(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function noise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = fade(xf), v = fade(yf), w = fade(zf);
    var x0 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u);
    var x1 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u);
    var x2 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u);
    var x3 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(x0, x1, v), lerp(x2, x3, v), w);
  }
  function fbm(x, y, z) {
    return 0.62 * noise(x, y, z) + 0.26 * noise(x * 2.1 + 7, y * 2.1 + 3, z * 1.3) + 0.12 * noise(x * 4.3 + 11, y * 4.3 + 5, z * 1.7);
  }

  var W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cell = 10, field = null;
  var colors = { ink: '#15130f', red: '#d9230f', paper: '#e9e4d8' };
  var pointer = { x: -1, y: -1, strength: 0 };
  var running = false, visible = true, raf = 0, frame = 0, t0 = performance.now();

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.ink = cs.getPropertyValue('--ink').trim() || colors.ink;
    colors.red = cs.getPropertyValue('--red').trim() || colors.red;
    colors.paper = cs.getPropertyValue('--paper-2').trim() || colors.paper;
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) { return; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = W > 900 ? 9 : W > 600 ? 10 : 12;
    cols = Math.ceil(W / cell) + 1;
    rows = Math.ceil(H / cell) + 1;
    field = new Float32Array(cols * rows);
    draw(performance.now());
  }

  function sample(time) {
    var z = time * 0.00006;
    var sx = 1 / 220, sy = 1 / 220;
    var px = pointer.x, py = pointer.y, ps = pointer.strength;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var x = i * cell, y = j * cell;
        var v = fbm(x * sx, y * sy, z);
        /* a gentle ridge running with the slice, so the relief has a grain */
        v += 0.08 * Math.sin((x * 0.6 + y) * 0.004 + z * 4);
        if (ps > 0.001) {
          var dx = x - px, dy = y - py;
          v += ps * 0.28 * Math.exp(-(dx * dx + dy * dy) / 9000);
        }
        field[j * cols + i] = v;
      }
    }
  }

  function edge(ax, ay, av, bx, by, bv, level) {
    var t = (level - av) / (bv - av);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  }

  function contour(level) {
    ctx.beginPath();
    for (var j = 0; j < rows - 1; j++) {
      for (var i = 0; i < cols - 1; i++) {
        var a = field[j * cols + i], b = field[j * cols + i + 1];
        var c = field[(j + 1) * cols + i + 1], d = field[(j + 1) * cols + i];
        var idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
        if (idx === 0 || idx === 15) { continue; }
        var x = i * cell, y = j * cell, x1 = x + cell, y1 = y + cell;
        var top = edge(x, y, a, x1, y, b, level), right = edge(x1, y, b, x1, y1, c, level);
        var bottom = edge(x, y1, d, x1, y1, c, level), left = edge(x, y, a, x, y1, d, level);
        var segs;
        switch (idx) {
          case 1: case 14: segs = [left, bottom]; break;
          case 2: case 13: segs = [bottom, right]; break;
          case 3: case 12: segs = [left, right]; break;
          case 4: case 11: segs = [top, right]; break;
          case 5: segs = [left, top, bottom, right]; break;
          case 6: case 9: segs = [top, bottom]; break;
          case 7: case 8: segs = [left, top]; break;
          case 10: segs = [left, bottom, top, right]; break;
        }
        for (var k = 0; k < segs.length; k += 2) {
          ctx.moveTo(segs[k][0], segs[k][1]);
          ctx.lineTo(segs[k + 1][0], segs[k + 1][1]);
        }
      }
    }
    ctx.stroke();
  }

  function draw(now) {
    if (!field) { return; }
    if (frame++ % 60 === 0) { readColors(); }
    sample(now - t0);
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var levels = 18;
    for (var l = 1; l < levels; l++) {
      var level = 0.22 + (l / levels) * 0.62;
      var major = l % 4 === 0;
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = major ? 0.72 : 0.3;
      ctx.lineWidth = major ? 1.1 : 0.7;
      contour(level);
    }
    /* one red isoline: the "slice" through the relief */
    ctx.strokeStyle = colors.red;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.4;
    contour(0.5 + 0.03 * Math.sin((now - t0) * 0.0004));
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) { return; }
    pointer.strength *= 0.96;
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

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.strength = 1;
    if (reduceMotion) { draw(performance.now()); }
  });
  canvas.addEventListener('pointerleave', function () { pointer.strength = 0.4; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) { start(); } else { stop(); }
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }
  new MutationObserver(function () { readColors(); if (!running) { draw(performance.now()); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    readColors(); if (!running) { draw(performance.now()); }
  });

  readColors();
  resize();
  canvas.classList.add('is-ready');
  if (fallback) { fallback.style.visibility = 'hidden'; }  /* keeps its box, which sizes the figure */
  start();
})();
