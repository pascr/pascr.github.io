/* Slice of Code: small progressive enhancements. No dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Theme toggle: pins light or dark in localStorage; clearing follows the system again. */
  var toggle = document.querySelector('[data-theme-toggle]');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    var pinned = root.getAttribute('data-theme');
    if (pinned === 'dark' || pinned === 'light') { return pinned; }
    return systemDark.matches ? 'dark' : 'light';
  }
  function syncToggleLabel() {
    if (!toggle) { return; }
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    toggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncToggleLabel();
    });
    systemDark.addEventListener('change', syncToggleLabel);
    syncToggleLabel();
  }

  /* Scroll reveal for [data-reveal] blocks. */
  var revealables = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (revealables.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealables.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      revealables.forEach(function (el) { io.observe(el); });
    }
  }

  /* Reading progress hairline on articles. */
  var progress = document.querySelector('.progress');
  var isArticle = document.body.classList.contains('layout-post') || document.body.classList.contains('layout-page');
  if (progress && isArticle) {
    var ticking = false;
    var update = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress.style.setProperty('--progress', ratio.toFixed(4));
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* Language badge on Rouge code blocks: <div class="language-bash highlighter-rouge"> */
  Array.prototype.forEach.call(document.querySelectorAll('div.highlighter-rouge'), function (block) {
    var match = /(?:^|\s)language-([\w+#-]+)/.exec(block.className);
    if (match && match[1] !== 'plaintext') { block.setAttribute('data-lang', match[1]); }
  });

  /* Side table of contents for pages, with a scroll spy. */
  var toc = document.querySelector('[data-toc]');
  var source = document.querySelector('[data-toc-source]');
  if (toc && source) {
    var headings = Array.prototype.slice.call(source.querySelectorAll('h2'));
    if (headings.length > 1) {
      var list = toc.querySelector('.toc-side-list');
      var links = headings.map(function (h, i) {
        if (!h.id) { h.id = 'section-' + (i + 1); }
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent.replace(/[.:]\s*$/, '');
        li.appendChild(a);
        list.appendChild(li);
        return a;
      });
      toc.hidden = false;

      var setActive = function (id) {
        links.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
        });
      };
      if ('IntersectionObserver' in window) {
        var visible = {};
        var spy = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
          var first = headings.filter(function (h) { return visible[h.id]; })[0];
          if (first) { setActive(first.id); }
        }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });
        headings.forEach(function (h) { spy.observe(h); });
      }
      setActive(headings[0].id);
    }
  }

  /* Hero: entrance once the photo has decoded, then a soft pointer parallax. */
  var hero = document.querySelector('[data-hero]');
  if (hero) {
    var title = document.querySelector('.hero-title');
    var layers = Array.prototype.slice.call(hero.querySelectorAll('[data-parallax]'));
    var go = function () {
      hero.classList.add('is-live');
      if (title) { title.classList.add('is-live'); }
    };
    /* next frame, so the pre-live styles are applied first and the transitions run */
    window.requestAnimationFrame(function () { window.requestAnimationFrame(go); });

    if (!reduceMotion && window.matchMedia('(pointer: fine)').matches && layers.length) {
      var section = hero.closest('.hero') || hero;
      var target = { x: 0, y: 0 }, current = { x: 0, y: 0 }, animating = false;
      var step = function () {
        current.x += (target.x - current.x) * 0.08;
        current.y += (target.y - current.y) * 0.08;
        layers.forEach(function (el) {
          var depth = parseFloat(el.getAttribute('data-parallax')) || 1;
          el.style.setProperty('--px', (current.x * depth).toFixed(2));
          el.style.setProperty('--py', (current.y * depth).toFixed(2));
        });
        if (Math.abs(target.x - current.x) > 0.05 || Math.abs(target.y - current.y) > 0.05) {
          window.requestAnimationFrame(step);
        } else { animating = false; }
      };
      var kick = function () { if (!animating) { animating = true; window.requestAnimationFrame(step); } };
      section.addEventListener('pointermove', function (e) {
        var r = section.getBoundingClientRect();
        target.x = ((e.clientX - r.left) / r.width - 0.5) * 18;
        target.y = ((e.clientY - r.top) / r.height - 0.5) * 12;
        kick();
      });
      section.addEventListener('pointerleave', function () { target.x = 0; target.y = 0; kick(); });
    }
  }

  /* Back to top. */
  var toTop = document.querySelector('[data-to-top]');
  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      var main = document.getElementById('main');
      if (main) { main.focus({ preventScroll: true }); }
    });
  }
})();
