// Staff Marketplace lister: copy buttons and a per-device "listed" tick list.
(function () {
  'use strict';
  var root = document.querySelector('[data-lister]');
  var KEY = 'scg-' + (root ? root.getAttribute('data-lister') : 'marketplace') + '-listed';
  var read = function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  var write = function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
  var listed = read();

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    var field = document.getElementById(btn.getAttribute('data-copy'));
    if (!field) return;
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('is-copied');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('is-copied'); }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(field.value).then(done, function () { field.select(); document.execCommand('copy'); done(); });
    } else {
      field.select();
      document.execCommand('copy');
      done();
    }
  });

  // Post one item to the Facebook Page via the site's bridge to the sync Worker.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-fb-post]');
    if (!btn) return;
    var box = btn.closest('[data-fb-item]');
    var status = box.querySelector('.fb-status');
    var text = box.querySelector('[data-fb-text]');
    var force = box.hasAttribute('data-fb-posted');
    if (force && !window.confirm('This item has already been posted. Post it again?')) return;
    btn.disabled = true; status.textContent = 'Posting…';
    fetch('/staff/facebook-post', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: box.getAttribute('data-fb-item'), message: text ? text.value : '', force: force }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var j = res.j || {};
        if (j.status === 'posted') {
          status.innerHTML = 'Posted. <a href="' + j.permalink + '" target="_blank" rel="noopener">View on Facebook</a>';
          box.setAttribute('data-fb-posted', '1');
          box.querySelector('summary').textContent = 'Posted to Facebook just now';
          btn.textContent = 'Post again';
        } else if (j.status === 'already_posted') {
          status.textContent = 'Already posted on ' + j.at.slice(0, 10) + '. Tick "Post again" to repeat.';
        } else {
          status.textContent = 'Not posted: ' + (j.message || 'unknown error');
        }
      })
      .catch(function (err) { status.textContent = 'Not posted: ' + err.message; })
      .then(function () { btn.disabled = false; });
  });

  var hide = document.getElementById('hide-listed');
  var count = document.getElementById('listed-count');
  var refresh = function () {
    var items = document.querySelectorAll('[data-item]');
    var n = 0;
    items.forEach(function (li) {
      var id = li.getAttribute('data-item');
      var on = !!listed[id];
      if (on) n++;
      li.classList.toggle('is-listed', on);
      li.hidden = !!(hide && hide.checked && on);
    });
    if (count) count.textContent = n + ' of ' + items.length + ' on this page ticked as listed';
  };
  document.querySelectorAll('[data-listed]').forEach(function (cb) {
    var id = cb.getAttribute('data-listed');
    cb.checked = !!listed[id];
    cb.addEventListener('change', function () {
      if (cb.checked) listed[id] = Date.now(); else delete listed[id];
      write(listed);
      refresh();
    });
  });
  if (hide) {
    try { hide.checked = localStorage.getItem(KEY + '-hide') === '1'; } catch (e) { /* ignore */ }
    hide.addEventListener('change', function () { try { localStorage.setItem(KEY + '-hide', hide.checked ? '1' : '0'); } catch (e) { /* ignore */ } refresh(); });
  }
  refresh();
})();
