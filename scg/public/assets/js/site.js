// Second Chance Goods: small progressive enhancements. The site works without this file.
(function () {
  'use strict';

  // Mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 861px)').addEventListener('change', function (m) {
      if (m.matches) setOpen(false);
    });
  }

  // Product gallery: thumbnails swap the main photo instead of opening the full-size file.
  var gallery = document.querySelector('[data-gallery]');
  if (gallery) {
    var main = gallery.querySelector('[data-gallery-main]');
    gallery.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.gallery-thumbs a');
      if (!a || !main) return;
      e.preventDefault();
      main.src = a.getAttribute('data-full');
      main.alt = a.getAttribute('data-alt');
      gallery.querySelectorAll('.gallery-thumbs a').forEach(function (t) {
        t.removeAttribute('aria-current');
      });
      a.setAttribute('aria-current', 'true');
    });
  }

  // Category rows: previous/next buttons for people who don't realise the row scrolls sideways.
  document.querySelectorAll('[data-scroll-btns]').forEach(function (btns) {
    var scroller = btns.parentElement.nextElementSibling;
    var row = scroller && scroller.querySelector('.cat-tiles');
    if (!row) return;
    var prev = btns.querySelector('.scroll-prev');
    var next = btns.querySelector('.scroll-next');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var update = function () {
      var max = row.scrollWidth - row.clientWidth;
      var atStart = row.scrollLeft <= 4;
      var atEnd = row.scrollLeft >= max - 4;
      prev.setAttribute('aria-disabled', String(atStart));
      next.setAttribute('aria-disabled', String(atEnd));
      scroller.classList.toggle('has-more', max > 4 && !atEnd);
      btns.hidden = max <= 4;
    };
    var step = function (dir) {
      var tile = row.querySelector('li');
      var w = tile ? tile.getBoundingClientRect().width + 14 : row.clientWidth * 0.6;
      row.scrollBy({ left: dir * w, behavior: reduce ? 'auto' : 'smooth' });
    };
    prev.addEventListener('click', function () { if (prev.getAttribute('aria-disabled') !== 'true') step(-1); });
    next.addEventListener('click', function () { if (next.getAttribute('aria-disabled') !== 'true') step(1); });
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });
})();
