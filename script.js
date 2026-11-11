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

// Quote form: posts to the Google Form in the owner's Workspace.
// Wired to the "JDB quote request" Google Form. If the Form changes, update the IDs below.
// If IDs are blank, it falls back to opening the visitor's email app.
(function () {
  var form = document.getElementById('quote-form');
  var status = document.getElementById('form-status');
  if (!form) return;

  var TO = 'stevenb@jdbwoodworks.com';
  var FORM_ID = '1FAIpQLSeSxQg10vwtH-Zlhfd7zMWprQJ75e7njn7mzxXCLXrMtBhYGw';            // the long id from .../forms/d/e/<FORM_ID>/viewform
  var ENTRY = {
    name:    'entry.604898754',
    phone:   'entry.239682535',   // Phone
    type:    'entry.1740857859',
    message: 'entry.246425212'
  };

  function show(msg) { status.hidden = false; status.textContent = msg; }
  function configured() {
    return FORM_ID && ENTRY.name && ENTRY.phone && ENTRY.type && ENTRY.message;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.elements.name.value.trim();
    var contact = form.elements.contact.value.trim();
    var type = form.elements.type.value;
    var phone = form.elements.phone.value.trim();
    var msg = form.elements.message.value.trim();
    if (!name || !phone || !msg) {
      show('Please fill in your name, your phone number, and a short description.');
      return;
    }

    if (!configured()) {
      var subject = 'Quote request: ' + type;
      var body = 'Name: ' + name + '\nEmail: ' + contact + '\nPhone: ' + phone + '\nNeed: ' + type + '\n\n' + msg;
      show('Opening your email app. If nothing opens, send your request to ' + TO + '.');
      window.location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      return;
    }

    var data = new URLSearchParams();
    data.append(ENTRY.name, name);
    data.append(ENTRY.phone, phone);
    data.append(ENTRY.type, type);
    data.append(ENTRY.message, contact ? msg + '\n\nEmail: ' + contact : msg);

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    show('Sending...');
    fetch('https://docs.google.com/forms/d/e/' + FORM_ID + '/formResponse', {
      method: 'POST',
      mode: 'no-cors',   // Google sends no CORS headers; the response is opaque
      body: data
    }).then(function () {
      form.reset();
      show('Thanks. Your request was sent and we will get back to you soon.');
    }).catch(function () {
      show('Something went wrong. Please email ' + TO + ' or call (484) 279-8459.');
    }).then(function () { btn.disabled = false; });
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
