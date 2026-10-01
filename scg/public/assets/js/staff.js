// Staff Marketplace lister: copy buttons and a per-device "listed" tick list.
(function () {
  'use strict';
  var KEY = 'scg-marketplace-listed';
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
