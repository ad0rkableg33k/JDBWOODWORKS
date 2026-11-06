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
