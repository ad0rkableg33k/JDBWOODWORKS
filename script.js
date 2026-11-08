// JDB Woodworks: small vanilla JS, no dependencies.

// Gallery filter buttons
(function () {
  var bar = document.getElementById('filters');
  var grid = document.getElementById('gallery');
  if (!bar || !grid) return;
  var cards = grid.querySelectorAll('.work-card');
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    var want = btn.getAttribute('data-filter');
    bar.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    cards.forEach(function (card) {
      card.hidden = !(want === 'All' || card.getAttribute('data-cat') === want);
    });
  });
})();

// Quote form: opens the visitor's email app with the message filled in.
(function () {
  var form = document.getElementById('quote-form');
  var status = document.getElementById('form-status');
  if (!form) return;
  var TO = 'Jdbwoodworker@gmail.com';
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.elements.name.value.trim();
    var contact = form.elements.contact.value.trim();
    var type = form.elements.type.value;
    var msg = form.elements.message.value.trim();
    if (!name || !contact || !msg) {
      status.hidden = false;
      status.textContent = 'Please fill in your name, how to reach you, and a short description.';
      return;
    }
    var subject = 'Quote request: ' + type;
    var body = 'Name: ' + name + '\nContact: ' + contact + '\nNeed: ' + type + '\n\n' + msg;
    status.hidden = false;
    status.textContent = 'Opening your email app. If nothing opens, send your request to ' + TO + '.';
    window.location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });
})();

/* ===== Square embed helper (JDB Woodworks) ===== */
(function () {
  if (window.parent === window) return; // not inside a frame, so do nothing

  function sendHeight() {
    window.parent.postMessage({
      type: 'jdb-height',
      height: Math.ceil(document.body.scrollHeight),
      path: location.pathname
    }, '*');
  }
  window.addEventListener('load', sendHeight);
  window.addEventListener('resize', sendHeight);
  if (window.ResizeObserver) { new ResizeObserver(sendHeight).observe(document.body); }

  // Menu links that jump down the page: ask Square's page to do the scrolling
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href && href.length > 1 && href.charAt(0) === '#') {
      var target = document.getElementById(href.slice(1));
      if (target) {
        e.preventDefault();
        window.parent.postMessage({
          type: 'jdb-scroll',
          top: target.getBoundingClientRect().top + window.pageYOffset
        }, '*');
      }
    }
  });

  // Outside links open in a new tab
  document.querySelectorAll('a[href^="http"]').forEach(function (a) {
    if (a.hostname !== location.hostname) { a.target = '_blank'; a.rel = 'noopener'; }
  });
})();
