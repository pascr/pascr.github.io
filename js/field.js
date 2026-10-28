/* Hero field: streams of thin lines flowing through a perspective field.
   Near rows are heavy and dark, far rows fine and faint; one stream is red.
   Follows the theme, reacts gently to the pointer, renders a single frame when
   reduced motion is requested, pauses off screen or in a hidden tab. */
(function () {
  'use strict';
  var canvas = document.querySelector('[data-field]');
  if (!canvas || !canvas.getContext) { return; }
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1;
  var ink = { r: 21, g: 19, b: 15 }, red = '#d9230f';
  var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  var running = false, visible = true, raf = 0, t0 = performance.now(), born = t0;

  function hexToRgb(h) {
    h = h.trim();
    if (h[0] === '#' && (h.length === 7)) {
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
  }

  /* Silhouettes that rise out of the field, drawn in a unit box (0..1), origin top-left. */
  function stroke(c, w, pts) {
    c.lineWidth = w; c.beginPath();
    pts.forEach(function (p, i) { if (i) { c.lineTo(p[0], p[1]); } else { c.moveTo(p[0], p[1]); } });
    c.stroke();
  }
  function disc(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  function ring(c, x, y, r, w) { c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); }
  var SHAPES = {
    swimmer: function (c) {
      stroke(c, 0.19, [[0.12, 0.56], [0.60, 0.52]]);                 /* body */
      disc(c, 0.71, 0.46, 0.105);                                     /* head */
      stroke(c, 0.12, [[0.48, 0.53], [0.40, 0.31], [0.60, 0.25]]);   /* recovering arm */
      stroke(c, 0.12, [[0.58, 0.54], [0.70, 0.74]]);                 /* pulling arm */
      stroke(c, 0.09, [[0.16, 0.56], [0.04, 0.64]]);                  /* legs */
      stroke(c, 0.09, [[0.16, 0.56], [0.03, 0.49]]);
    },
    cyclist: function (c) {
      ring(c, 0.25, 0.75, 0.18, 0.09); ring(c, 0.75, 0.75, 0.18, 0.09);
      stroke(c, 0.045, [[0.26, 0.74], [0.46, 0.44], [0.74, 0.74]]);
      stroke(c, 0.045, [[0.46, 0.44], [0.66, 0.44]]);
      stroke(c, 0.045, [[0.50, 0.70], [0.46, 0.44]]);
      stroke(c, 0.045, [[0.50, 0.70], [0.26, 0.74]]);
      stroke(c, 0.17, [[0.42, 0.42], [0.70, 0.22]]);                  /* torso */
      stroke(c, 0.07, [[0.70, 0.24], [0.66, 0.42]]);                  /* arm */
      disc(c, 0.80, 0.13, 0.105);                                     /* head */
      stroke(c, 0.11, [[0.44, 0.40], [0.56, 0.58], [0.50, 0.70]]);    /* leg */
    },
    runner: function (c) {
      disc(c, 0.60, 0.12, 0.105);
      stroke(c, 0.18, [[0.56, 0.24], [0.48, 0.52]]);                  /* torso */
      stroke(c, 0.13, [[0.48, 0.52], [0.70, 0.64], [0.62, 0.94]]);   /* front leg */
      stroke(c, 0.13, [[0.48, 0.52], [0.30, 0.66], [0.12, 0.88]]);   /* back leg */
      stroke(c, 0.07, [[0.54, 0.30], [0.72, 0.40], [0.80, 0.26]]);    /* arms */
      stroke(c, 0.07, [[0.54, 0.30], [0.36, 0.38], [0.42, 0.52]]);
    },
    mountain: function (c) {
      var m = [[0.0,0.611],[0.034,0.562],[0.095,0.527],[0.135,0.483],[0.209,0.431],[0.252,0.338],[0.278,0.326],[0.293,0.281],[0.314,0.202],[0.344,0.193],[0.377,0.166],[0.402,0.053],[0.425,0.028],[0.469,0.0],[0.532,0.005],[0.606,0.078],[0.666,0.123],[0.701,0.197],[0.712,0.24],[0.751,0.301],[0.794,0.34],[0.833,0.408],[0.857,0.418],[0.875,0.426],[0.949,0.454],[0.986,0.528],[1.0,0.495]];
      c.beginPath();
      c.moveTo(m[0][0], 1.0);
      m.forEach(function (p) { c.lineTo(p[0], p[1]); });
      c.lineTo(m[m.length - 1][0], 1.0);
      c.closePath(); c.fill();
    }
  };
  var ORDER = ['swimmer', 'cyclist', 'runner', 'mountain'];
  var HOLD = 4.2, MORPH = 2.2, REST = 3.0;          /* seconds: shape held, crossfade, empty field between cycles */
  var MW = 320, MH = 200, masks = {}, box = { x: 0, y: 0, s: 1 };

  function blur(src, w, h, r) {
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length), x, y, k, sum, n;
    for (y = 0; y < h; y++) { for (x = 0; x < w; x++) { sum = 0; n = 0; for (k = -r; k <= r; k++) { var xx = x + k; if (xx >= 0 && xx < w) { sum += src[y * w + xx]; n++; } } tmp[y * w + x] = sum / n; } }
    for (y = 0; y < h; y++) { for (x = 0; x < w; x++) { sum = 0; n = 0; for (k = -r; k <= r; k++) { var yy = y + k; if (yy >= 0 && yy < h) { sum += tmp[yy * w + x]; n++; } } out[y * w + x] = sum / n; } }
    return out;
  }
  function buildMasks() {
    /* the figure box: a square on the right half, clear of the name's left edge */
    box.s = Math.min(W * 0.42, H * 0.6);
    box.x = W - box.s - W * 0.04;
    box.y = H * 0.03;
    var off = document.createElement('canvas');
    off.width = MW; off.height = MH;
    var c = off.getContext('2d');
    ORDER.forEach(function (name) {
      c.clearRect(0, 0, MW, MH);
      c.save();
      c.scale(MW / W, MH / H);
      c.translate(box.x, box.y);
      c.scale(box.s, box.s);
      c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
      SHAPES[name](c);
      c.restore();
      var px = c.getImageData(0, 0, MW, MH).data;
      var m = new Float32Array(MW * MH);
      for (var i = 0; i < MW * MH; i++) { m[i] = px[i * 4 + 3] / 255; }
      masks[name] = blur(m, MW, MH, 2);
    });
  }
  function sampleMask(m, x, y) {
    var mx = x / W * MW, my = y / H * MH;
    var ix = mx | 0, iy = my | 0;
    if (ix < 0 || iy < 0 || ix >= MW - 1 || iy >= MH - 1) { return 0; }
    var fx = mx - ix, fy = my - iy, i = iy * MW + ix;
    return (m[i] * (1 - fx) + m[i + 1] * fx) * (1 - fy) + (m[i + MW] * (1 - fx) + m[i + MW + 1] * fx) * fy;
  }
  /* which shapes are up, and how much, at time t */
  function weights(t) {
    var w = {}, cycle = REST + ORDER.length * (MORPH + HOLD), u = t % cycle;
    ORDER.forEach(function (n) { w[n] = 0; });
    if (u < REST) { return w; }
    u -= REST;
    for (var k = 0; k < ORDER.length; k++) {
      var start = k * (MORPH + HOLD);
      var a = (u - start) / MORPH;                       /* rise */
      var b = (u - start - MORPH - HOLD) / MORPH;        /* fall, overlaps the next rise */
      var v = Math.min(1, Math.max(0, a)) - Math.min(1, Math.max(0, b));
      w[ORDER[k]] = v * v * (3 - 2 * v);
    }
    return w;
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) { return; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildMasks();
    draw(performance.now());
  }

  /* layered sines: cheap, smooth, deterministic */
  function wave(u, t, row) {
    return Math.sin(u * 1.9 + t * 0.35 + row * 0.7) * 0.5
         + Math.sin(u * 4.3 - t * 0.22 + row * 1.9) * 0.28
         + Math.sin(u * 9.1 + t * 0.6 - row * 0.4) * 0.12
         + Math.sin(u * 0.7 - t * 0.12 + row * 3.1) * 0.6;
  }

  function draw(now) {
    var t = (now - t0) / 1000;
    var fade = reduceMotion ? 1 : Math.min(1, (now - born) / 1800);
    ctx.clearRect(0, 0, W, H);

    var rows = W < 640 ? 44 : 72;
    var horizon = H * (0.10 + (pointer.y - 0.5) * 0.05);      /* where far rows converge */
    var floor = H * 0.98;                                       /* where the nearest row sits */
    var shift = (pointer.x - 0.5) * 40;                         /* slight horizontal parallax */
    var redRow = Math.round(rows * 0.62);
    var w = reduceMotion ? { mountain: 1 } : weights(t);
    var active = ORDER.filter(function (n) { return w[n] > 0.001; });
    var lift = H * 0.26;                                        /* how high a shape pushes the streams */

    var lift = 20;                                              /* small relief where a shape passes */
    var inkRGB = ink.r + ',' + ink.g + ',' + ink.b;
    for (var i = 0; i < rows; i++) {
      var d = i / (rows - 1);                 /* 0 far .. 1 near */
      var persp = Math.pow(d, 2.2);           /* rows bunch up towards the horizon */
      var y0 = horizon + (floor - horizon) * persp;
      var amp = 8 + 120 * persp;              /* near rows swing more */
      var alpha = 0.14 + 0.5 * persp;
      var isRed = i === redRow;
      var width = isRed ? 1.6 : 0.6 + 1.1 * persp;
      var step = 6, level = -1, open = false;
      for (var x = -20; x <= W + 20; x += step) {
        var u = (x + shift * (1 - d) * 3) / W * 2.2;
        var y = y0 + wave(u, t, i) * amp
              + Math.sin((x / W) * Math.PI) * 10 * (1 - d);   /* a gentle bow in the far rows */
        var m = 0;
        for (var k = 0; k < active.length; k++) { m += sampleMask(masks[active[k]], x, y0) * w[active[k]]; }
        if (m > 1) { m = 1; }
        y = y0 + (y - y0) * (1 - 0.75 * m) - m * lift;         /* calmer and lifted inside a shape */
        var q = Math.round(m * 6);            /* quantised emphasis, so a row is a handful of sub-paths */
        if (q !== level) {
          if (open) { ctx.lineTo(x, y); ctx.stroke(); }
          level = q;
          var e = level / 6;
          ctx.beginPath();
          ctx.lineWidth = width * (1 + 1.9 * e);
          if (isRed) { ctx.strokeStyle = red; ctx.globalAlpha = (0.95 * fade); }
          else { ctx.strokeStyle = 'rgba(' + inkRGB + ',' + (Math.min(1, alpha * (1 + 3.2 * e)) * fade).toFixed(3) + ')'; ctx.globalAlpha = 1; }
          ctx.moveTo(x, y);
          open = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (open) { ctx.stroke(); }
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
