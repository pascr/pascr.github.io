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
    return d.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  }

  function row(post) {
    var li = document.createElement('li');
    var a = document.createElement('a'); a.href = post.url; a.textContent = post.title;
    var time = document.createElement('time'); time.setAttribute('datetime', post.date); time.textContent = formatDate(post.date);
    li.appendChild(a); li.appendChild(time);
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
      picks.forEach(function (p) { list.appendChild(row(p)); });
      box.hidden = false;
    })
    .catch(function () { /* stay quiet: the 404 page works without suggestions */ });
})();
