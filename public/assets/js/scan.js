// Price Scanner: shrink photos before upload, show thumbnails, load asking prices, save edits, copy fields.
(function () {
  'use strict';
  var form = document.getElementById('scan-form');
  var input = document.getElementById('scan-photos');
  var thumbs = document.getElementById('scan-thumbs');
  var status = document.getElementById('scan-status');
  var MAX_EDGE = 1600, QUALITY = 0.85, MAX_PHOTOS = 12;
  var files = [];

  function shrink(file) {
    return new Promise(function (resolve) {
      if (!file.type.startsWith('image/')) return resolve(null);
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', QUALITY);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function render() {
    thumbs.innerHTML = '';
    files.forEach(function (f, i) {
      var li = document.createElement('li');
      var im = document.createElement('img'); im.src = URL.createObjectURL(f); im.alt = 'Photo ' + (i + 1);
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'scan-remove'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Remove photo ' + (i + 1));
      rm.addEventListener('click', function () { files.splice(i, 1); render(); });
      li.appendChild(im); li.appendChild(rm); thumbs.appendChild(li);
    });
    status.textContent = files.length ? files.length + ' photo' + (files.length === 1 ? '' : 's') + ' ready' : '';
  }

  if (input) {
    input.addEventListener('change', function () {
      var picked = Array.prototype.slice.call(input.files || []);
      input.value = '';
      status.textContent = 'Preparing photos…';
      Promise.all(picked.map(shrink)).then(function (out) {
        out.forEach(function (f) { if (f && files.length < MAX_PHOTOS) files.push(f); });
        render();
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!files.length) { status.textContent = 'Add at least one photo.'; return; }
      var fd = new FormData();
      files.forEach(function (f) { fd.append('photos', f); });
      fd.append('notes', document.getElementById('scan-notes').value);
      document.getElementById('scan-go').disabled = true;
      status.textContent = 'Identifying… this takes 10–20 seconds.';
      fetch(form.action, { method: 'POST', body: fd, redirect: 'follow' })
        .then(function (r) { if (r.redirected) { location.href = r.url; return; } return r.text().then(function (html) { document.open(); document.write(html); document.close(); }); })
        .catch(function (err) { status.textContent = 'Failed: ' + err.message; document.getElementById('scan-go').disabled = false; });
    });
  }

  // ---- result page
  var result = document.querySelector('.scan-result');
  if (!result) return;
  var scanId = result.getAttribute('data-scan');
  var money = function (p) { return '£' + (p / 100).toFixed(2); };

  var stats = document.getElementById('stats');
  var pct = function (n) { return n === null ? '–' : n + '%'; };
  var dayz = function (d) { return d === null ? '–' : (d < 1 ? 'under a day' : Math.round(d) + ' day' + (Math.round(d) === 1 ? '' : 's')); };
  function loadStats(url) {
    if (!stats) return;
    stats.innerHTML = '<p class="fb-note">Loading sold statistics…</p>';
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { stats.innerHTML = '<p class="fb-note">Sold statistics unavailable: ' + j.error + '</p>'; return; }
      var y = j.yours;
      var html = '<h3>Your sales, last ' + j.days + ' days</h3>';
      if (!y.ended && !j.activeNow) { stats.innerHTML = html + '<p class="fb-note">You haven’t listed anything matching “' + j.query + '” recently. Use the Sold button to see the wider market.</p>'; return; }
      html += '<dl class="stat-grid">'
        + '<div><dt>Listed → sold</dt><dd>' + y.ended + ' ended · <strong>' + y.sold + ' sold</strong></dd><small>' + (y.sellThroughPct === null ? '' : pct(y.sellThroughPct) + ' sell-through') + '</small></div>'
        + '<div><dt>Average sold price</dt><dd>' + (y.avgSoldPence === null ? '–' : money(y.avgSoldPence)) + '</dd><small>' + (y.lowestSoldPence === null ? '' : money(y.lowestSoldPence) + ' – ' + money(y.highestSoldPence)) + '</small></div>'
        + '<div><dt>Highest sold</dt><dd>' + (y.highestSoldPence === null ? '–' : money(y.highestSoldPence)) + '</dd></div>'
        + '<div><dt>Average time to sell</dt><dd>' + dayz(y.avgDaysToSell) + '</dd><small>' + (y.medianDaysToSell === null ? '' : 'typically ' + dayz(y.medianDaysToSell)) + '</small></div>'
        + '<div><dt>Listed right now</dt><dd>' + j.activeNow + '</dd></div>'
        + '</dl>';
      if (y.recent.length) {
        html += '<ul class="comps-list">';
        y.recent.forEach(function (r) { html += '<li><span class="comps-noimg comps-sold">Sold</span><a href="' + r.url + '" target="_blank" rel="noopener">' + r.title.replace(/</g, '&lt;') + '</a><span class="comps-price">' + money(r.pricePence) + '</span><small>' + r.soldAt.slice(0, 10) + (r.daysToSell === null ? '' : ' · ' + dayz(r.daysToSell) + ' to sell') + '</small></li>'; });
        html += '</ul>';
      }
      stats.innerHTML = html + '<p class="fb-note">From your own eBay listing history. eBay-wide sold prices are behind the Sold and Terapeak buttons.</p>';
    }).catch(function (e) { stats.innerHTML = '<p class="fb-note">Sold statistics unavailable: ' + e.message + '</p>'; });
  }
  if (stats) loadStats(stats.getAttribute('data-stats-url'));

  var comps = document.getElementById('comps');
  function loadComps(url) {
    comps.innerHTML = '<p class="fb-note">Loading current asking prices…</p>';
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { comps.innerHTML = '<p class="fb-note">Asking prices unavailable: ' + j.error + '</p>'; return; }
      if (!j.count) { comps.innerHTML = '<p class="fb-note">No current UK listings found for “' + j.query + '”. Try the Sold link, or change the search.</p>'; return; }
      var html = '<h3>On eBay right now</h3><p class="comps-summary"><strong>' + j.count + '</strong> currently listed by anyone (buy-it-now, UK): lowest <strong>' + money(j.minPence) + '</strong> · typical <strong>' + money(j.medianPence) + '</strong> · highest <strong>' + money(j.maxPence) + '</strong></p><ul class="comps-list">';
      j.items.forEach(function (it) {
        html += '<li>' + (it.image ? '<img src="' + it.image + '" alt="" loading="lazy">' : '<span class="comps-noimg"></span>') + '<a href="' + it.url + '" target="_blank" rel="noopener">' + it.title.replace(/</g, '&lt;') + '</a><span class="comps-price">' + money(it.pricePence) + '</span><small>' + it.condition.replace(/</g, '&lt;') + '</small></li>';
      });
      comps.innerHTML = html + '</ul><p class="fb-note">Asking prices, not sold prices. Use the Sold button for what actually sells.</p>';
    }).catch(function (e) { comps.innerHTML = '<p class="fb-note">Asking prices unavailable: ' + e.message + '</p>'; });
  }
  if (comps) loadComps(comps.getAttribute('data-comps-url'));

  // change search query → update links + comps + save
  var changeBtn = document.querySelector('[data-edit-query]');
  if (changeBtn) changeBtn.addEventListener('click', function () {
    var cur = document.querySelector('.price-query strong').textContent;
    var q = window.prompt('Search eBay for:', cur);
    if (!q || q === cur) return;
    document.querySelector('.price-query strong').textContent = q;
    var enc = encodeURIComponent(q);
    document.querySelector('[data-link=sold]').href = 'https://www.ebay.co.uk/sch/i.html?_nkw=' + enc + '&LH_Sold=1&LH_Complete=1&_sop=13';
    document.querySelector('[data-link=terapeak]').href = 'https://www.ebay.co.uk/sh/research?marketplace=EBAY-GB&keywords=' + enc + '&dayRange=90&tabName=SOLD';
    document.querySelector('[data-link=active]').href = 'https://www.ebay.co.uk/sch/i.html?_nkw=' + enc + '&_sop=15';
    loadComps('/staff/scan/comps?q=' + enc);
    loadStats('/staff/scan/stats?q=' + enc);
    save({ searchQuery: q });
  });

  // copy buttons + counters
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    var field = document.getElementById(btn.getAttribute('data-copy'));
    var done = function () { var old = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('is-copied'); setTimeout(function () { btn.textContent = old; btn.classList.remove('is-copied'); }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(field.value).then(done, function () { field.select(); document.execCommand('copy'); done(); });
    else { field.select(); document.execCommand('copy'); done(); }
  });
  document.querySelectorAll('[data-count-for]').forEach(function (c) {
    var f = document.getElementById(c.getAttribute('data-count-for'));
    f.addEventListener('input', function () { c.textContent = f.value.length + '/' + f.maxLength; });
  });

  var statusEl = document.querySelector('.scan-actions .fb-status');
  function save(extra) {
    var edits = {};
    document.querySelectorAll('[data-edit]').forEach(function (el) { edits[el.id] = el.value; });
    Object.assign(edits, extra || {});
    statusEl.textContent = 'Saving…';
    return fetch('/staff/scan/' + scanId, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', edits: edits }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { statusEl.textContent = j.ok ? 'Saved' : 'Not saved: ' + (j.error || 'unknown'); })
      .catch(function (err) { statusEl.textContent = 'Not saved: ' + err.message; });
  }
  document.querySelector('[data-save]').addEventListener('click', function () { save(); });
  document.querySelector('[data-discard]').addEventListener('click', function () {
    if (!window.confirm('Discard this scan?')) return;
    fetch('/staff/scan/' + scanId, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'discard' }) }).then(function () { location.href = '/staff/scan'; });
  });
})();
