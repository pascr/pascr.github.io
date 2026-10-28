/* The route: one line drawn through the home page, scroll-driven. Anchors are
   elements with data-anchor; the path runs through them in document order of
   the legs, with rounded corners. Stations, peaks, pulses and the finish light
   up when the drawn end passes them. */
(function () {
  'use strict';
  var route = document.querySelector('[data-route]');
  var svg = route && route.querySelector('[data-spine]');
  if (!route || !svg) { return; }
  var line = svg.querySelector('.spine-line'), ghost = svg.querySelector('.spine-ghost');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function centre(el) {
    var r = el.getBoundingClientRect(), b = route.getBoundingClientRect();
    var dot = el.querySelector('.station-dot, .peak-dot, .pulse-tick, .finish-dot');
    if (dot) { r = dot.getBoundingClientRect(); }
    return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2, el: el };
  }
  function byName(name) { return route.querySelector('[data-anchor="' + name + '"]'); }

  /* posts close in time would stack: nudge each pulse right until it clears the previous card */
  function spreadPulses(els) {
    if (!els.length) { return; }
    var box = els[0].parentElement.getBoundingClientRect();
    var minGap = Math.min(box.width / Math.max(1, els.length), parseFloat(getComputedStyle(els[0].querySelector('.pulse-card')).width) * 0.6 + 24);
    var half = parseFloat(getComputedStyle(els[0].querySelector('.pulse-card')).width) / 2;
    var lastX = -Infinity;
    els.forEach(function (el) {
      var x = Math.max(half, parseFloat(el.style.getPropertyValue('--x')) / 100 * box.width);
      if (x - lastX < minGap) { x = lastX + minGap; }
      x = Math.min(x, box.width - 8);
      el.style.left = x + 'px';
      lastX = x;
    });
  }

  var marks = [], lastW = 0, lastH = 0;
  function build() {
    var W = route.clientWidth, Hh = route.clientHeight;
    if (W === lastW && Hh === lastH) { return; }
    lastW = W; lastH = Hh;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
    svg.setAttribute('preserveAspectRatio', 'none');
    var pts = [], lit = [];
    function push(p, el) { pts.push(p); if (el) { lit.push({ el: el, i: pts.length - 1 }); } }

    var exit = centre(byName('hero-exit'));
    var about = centre(byName('about'));
    var xpStart = centre(byName('xp-start'));
    var peaks = Array.prototype.slice.call(route.querySelectorAll('[data-anchor^="peak-"]')).map(centre);
    var summit = centre(byName('summit'));
    var wStart = centre(byName('writing-start'));
    var pulseEls = Array.prototype.slice.call(route.querySelectorAll('[data-anchor^="pulse-"]'));
    spreadPulses(pulseEls);
    var pulses = pulseEls.map(centre);
    var wEnd = centre(byName('writing-end'));
    var readme = byName('readme') ? centre(byName('readme')) : null;
    var finish = centre(byName('finish'));
    var narrow = W < 1024;

    /* hero exit, straight down to the About station */
    push({ x: exit.x, y: exit.y - 2 });
    push({ x: about.x, y: exit.y + 40 });
    push({ x: about.x, y: about.y }, about.el);
    /* down and across to the Experience station at the left */
    push({ x: about.x, y: xpStart.y - 60 });
    push({ x: xpStart.x, y: xpStart.y }, xpStart.el);
    /* down to the first peak, then the ridge */
    push({ x: xpStart.x, y: peaks.length ? peaks[0].y : xpStart.y + 100 });
    peaks.forEach(function (p, k) {
      if (k) {
        /* a small saddle between two peaks, so the ridge reads as mountains */
        var prev = peaks[k - 1];
        push({ x: (prev.x + p.x) / 2, y: Math.max(prev.y, p.y) + 18 + Math.abs(p.y - prev.y) * 0.25 });
      }
      push({ x: p.x, y: p.y }, p.el);
    });
    push({ x: summit.x, y: summit.y }, summit.el);
    /* the descent: down the right margin beside the chapters, then across to the Writing station */
    push({ x: summit.x, y: wStart.y - 90 });
    push({ x: wStart.x, y: wStart.y - 90 });
    push({ x: wStart.x, y: wStart.y }, wStart.el);
    /* along the pulse axis, spiking at each post */
    if (pulses.length) {
      var axisY = pulses[0].y;
      push({ x: wStart.x, y: axisY });
      pulses.forEach(function (p) {
        var up = p.el.classList.contains('pulse--up') ? -1 : 1;
        push({ x: p.x - 14, y: axisY });
        push({ x: p.x, y: axisY + up * 46 }, p.el);
        push({ x: p.x + 14, y: axisY });
      });
      push({ x: wEnd.x, y: axisY });
    }
    /* Readme station on the right, then the finish */
    if (readme) {
      push({ x: wEnd.x, y: readme.y - 60 });
      push({ x: readme.x, y: readme.y }, readme.el);
      push({ x: readme.x, y: finish.y - 40 });
    }
    push({ x: finish.x, y: finish.y }, finish.el);

    /* rounded corners */
    var r = narrow ? 16 : 28, d = 'M' + pts[0].x + ' ' + pts[0].y;
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var d1 = Math.hypot(b.x - a.x, b.y - a.y), d2 = Math.hypot(c.x - b.x, c.y - b.y);
      var rr = Math.min(r, d1 / 2, d2 / 2);
      if (rr < 1) { d += ' L' + b.x + ' ' + b.y; continue; }
      var p1 = { x: b.x + (a.x - b.x) / d1 * rr, y: b.y + (a.y - b.y) / d1 * rr };
      var p2 = { x: b.x + (c.x - b.x) / d2 * rr, y: b.y + (c.y - b.y) / d2 * rr };
      d += ' L' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) + ' Q' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    var last = pts[pts.length - 1];
    d += ' L' + last.x + ' ' + last.y;
    line.setAttribute('d', d); ghost.setAttribute('d', d);

    /* where along the path each lit element sits */
    var total = line.getTotalLength();
    marks = lit.map(function (m) {
      var target = pts[m.i], best = 0, bestD = Infinity;
      for (var s = 0; s <= 200; s++) {
        var q = line.getPointAtLength(total * s / 200), dd = Math.hypot(q.x - target.x, q.y - target.y);
        if (dd < bestD) { bestD = dd; best = s / 200; }
      }
      return { el: m.el, at: best, y: target.y };
    });
    update();
  }

  var drawn = 0;
  function update() {
    var b = route.getBoundingClientRect();
    var top = -b.top, vh = window.innerHeight;
    /* the drawn end sits two thirds down the viewport */
    var progress = (top + vh * 0.66) / b.height;
    progress = Math.min(1, Math.max(0, progress));
    if (reduceMotion) { progress = 1; }
    drawn = progress;
    line.style.strokeDashoffset = (1 - progress).toFixed(4);
    var yNow = progress * b.height;
    marks.forEach(function (m) { m.el.classList.toggle('is-lit', m.y <= yNow + 2); });
  }

  /* peaks highlight their chapter */
  route.querySelectorAll('[data-peak]').forEach(function (peak) {
    var chapter = route.querySelector('[data-chapter="' + peak.getAttribute('data-peak') + '"]');
    if (!chapter) { return; }
    peak.addEventListener('mouseenter', function () { chapter.classList.add('is-active'); peak.classList.add('is-active'); });
    peak.addEventListener('mouseleave', function () { chapter.classList.remove('is-active'); peak.classList.remove('is-active'); });
    peak.addEventListener('focus', function () { chapter.classList.add('is-active'); });
    peak.addEventListener('blur', function () { chapter.classList.remove('is-active'); });
  });

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(function () { update(); ticking = false; }); ticking = true; }
  }, { passive: true });
  if ('ResizeObserver' in window) { new ResizeObserver(function () { build(); }).observe(route); } else { window.addEventListener('resize', build); }
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(build); }
  window.addEventListener('load', build);
  build();
})();
