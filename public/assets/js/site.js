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
})();
