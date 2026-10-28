/* Hero signal: a band of thin streams flowing across the whole width, one in
   red. Follows the theme, drifts gently with the pointer, renders a single
   frame when reduced motion is requested, pauses off screen or in a hidden tab. */
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
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) { return; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  function draw(now) {
    var t = (now - t0) / 1000;
    var fade = reduceMotion ? 1 : Math.min(1, (now - born) / 1600);
    ctx.clearRect(0, 0, W, H);

    var lines = W < 640 ? 12 : 16;
    var centre = H * ((W < 640 ? 0.36 : 0.44) + (pointer.y - 0.5) * 0.04);   /* the band sits across the name */
    var spacing = W < 640 ? 7 : 9;
    var swing = Math.min(150, H * 0.17);
    var redLine = 6;
    var inkRGB = ink.r + ',' + ink.g + ',' + ink.b;

    for (var k = 0; k < lines; k++) {
      var isRed = k === redLine;
      var depth = k / (lines - 1);                       /* 0 light and thin .. 1 dark and heavier */
      ctx.beginPath();
      ctx.lineWidth = isRed ? 1.6 : 0.8 + 0.6 * depth;
      ctx.strokeStyle = isRed ? red : 'rgba(' + inkRGB + ',' + ((0.14 + 0.3 * depth) * fade).toFixed(3) + ')';
      ctx.globalAlpha = isRed ? 0.95 * fade : 1;
      for (var x = 0; x <= W; x += 4) {
        var u = x / W;
        var env = Math.sin(u * Math.PI);                 /* calm at the edges, lively in the middle */
        var amp = swing * env * (1 - k * 0.035);
        var ph = (pointer.x - 0.5) * 0.8;
        var y = centre + k * spacing
              + Math.sin(x * 0.011 + k * 0.6 + t * 0.35 + ph) * amp * 0.5
              + Math.sin(x * 0.027 - k * 0.3 - t * 0.22) * amp * 0.25
              + Math.sin(x * 0.0045 + k * 0.9 + t * 0.12) * amp * 0.35;
        if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
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
