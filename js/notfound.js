/* 404 page: suggest the closest post URLs using FuzzySet over /api/posts.json. */
(function () {
  'use strict';
  var box = document.querySelector('[data-suggestions]');
  if (!box || typeof FuzzySet !== 'function' || !window.fetch) { return; }

  var list = box.querySelector('[data-suggestion-list]');
  var requested = window.location.pathname.toLowerCase();

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) { return ''; }
    var m = String(d.getMonth() + 1); if (m.length < 2) { m = '0' + m; }
    var day = String(d.getDate()); if (day.length < 2) { day = '0' + day; }
    return d.getFullYear() + ' · ' + m + ' · ' + day;
  }

  function row(post, index) {
    var li = document.createElement('li');
    li.className = 'post-row';
    var a = document.createElement('a');
    a.className = 'post-row-link';
    a.href = post.url;

    var idx = document.createElement('span');
    idx.className = 'post-row-index mono';
    idx.textContent = (index < 9 ? '0' : '') + (index + 1);

    var main = document.createElement('span');
    main.className = 'post-row-main';
    var title = document.createElement('span');
    title.className = 'post-row-title';
    title.textContent = post.title;
    main.appendChild(title);
    if (post.tags && post.tags.length) {
      var tags = document.createElement('span');
      tags.className = 'post-row-tags mono';
      tags.textContent = post.tags.map(function (t) { return '#' + t; }).join(' ');
      main.appendChild(tags);
    }

    var time = document.createElement('time');
    time.className = 'post-row-date mono';
    time.setAttribute('datetime', post.date);
    time.textContent = formatDate(post.date);

    var arrow = document.createElement('span');
    arrow.className = 'post-row-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    a.appendChild(idx); a.appendChild(main); a.appendChild(time); a.appendChild(arrow);
    li.appendChild(a);
    return li;
  }

  fetch(box.getAttribute('data-source'))
    .then(function (r) { return r.json(); })
    .then(function (posts) {
      if (!posts || !posts.length) { return; }
      var byUrl = {};
      posts.forEach(function (p) { byUrl[p.url.toLowerCase()] = p; });
      var set = FuzzySet(Object.keys(byUrl));
      var matches = set.get(requested, [], 0.1) || [];
      var picks = matches.slice(0, 5).map(function (m) { return byUrl[m[1]]; });
      if (!picks.length) { picks = posts.slice(0, 5); }
      picks.forEach(function (p, i) { list.appendChild(row(p, i)); });
      box.hidden = false;
    })
    .catch(function () { /* stay quiet: the 404 page works without suggestions */ });
})();
