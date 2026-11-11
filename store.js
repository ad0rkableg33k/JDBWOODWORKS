// JDB Woodworks store. Reads products.json and renders PayPal Buy Now buttons.
// SETUP: paste your PayPal REST app "Client ID" below (public by design, safe in this file).
// Get it at developer.paypal.com > Apps & Credentials > Live. Leave blank to show items without Buy buttons.
(function () {
  'use strict';

  var PAYPAL_CLIENT_ID = '';
  var CURRENCY = 'USD';

  var grid = document.getElementById('products');
  var note = document.getElementById('store-status');
  var fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY });

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function say(msg, cls) { note.hidden = false; note.className = 'store-note ' + (cls || ''); note.textContent = msg; }

  fetch('products.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var list = (data.products || []).filter(function (p) { return p && p.name && p.price > 0; });
      if (!list.length) { say('New pieces are coming soon. In the meantime, you can request something custom.'); return; }
      render(list);
      if (PAYPAL_CLIENT_ID) loadPayPal(list); else say('Online checkout is not switched on yet. Call or text (484) 279-8459 to buy anything below.');
    })
    .catch(function () { say('The shop could not load right now. Please try again in a bit.', 'err'); });

  function render(list) {
    grid.innerHTML = list.map(function (p, idx) {
      var out = !(p.qty > 0);
      var img = p.image ? '<div class="pic"><img src="images/' + encodeURIComponent(p.image) + '" alt="' + esc(p.name) + '" loading="lazy"></div>' : '';
      return '<article class="product' + (out ? ' sold' : '') + '">' + img +
        '<div class="body"><h3>' + esc(p.name) + '</h3>' +
        '<div class="price">' + fmt.format(p.price) + '</div>' +
        (p.description ? '<p class="desc">' + esc(p.description) + '</p>' : '<p class="desc"></p>') +
        (out ? '<div class="soldout">Sold out</div>'
             : '<div class="stock' + (p.qty <= 2 ? ' few' : '') + '">' + (p.qty <= 2 ? 'Only ' + p.qty + ' left' : 'In stock') + '</div>') +
        (out ? '' : '<div class="pay" id="pay-' + idx + '"></div>') +
        '</div></article>';
    }).join('');
  }

  function loadPayPal(list) {
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(PAYPAL_CLIENT_ID) + '&currency=' + CURRENCY + '&components=buttons';
    s.onload = function () { list.forEach(mount); };
    s.onerror = function () { say('PayPal could not load. Call or text (484) 279-8459 to buy.', 'err'); };
    document.head.appendChild(s);
  }

  function mount(p, idx) {
    var el = document.getElementById('pay-' + idx);
    if (!el || !window.paypal) return;
    paypal.Buttons({
      style: { layout: 'horizontal', tagline: false, label: 'buynow', color: 'gold', height: 44 },
      createOrder: function (data, actions) {
        return actions.order.create({
          purchase_units: [{
            description: p.name,
            custom_id: p.id,
            amount: { currency_code: CURRENCY, value: Number(p.price).toFixed(2) }
          }]
        });
      },
      onApprove: function (data, actions) {
        return actions.order.capture().then(function () {
          say('Thanks! Your payment for ' + p.name + ' went through. PayPal emailed your receipt, and we will be in touch about shipping or pickup.', 'ok');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      },
      onCancel: function () { say('Checkout cancelled. Nothing was charged.'); },
      onError: function () { say('Something went wrong with PayPal and nothing was charged. Please try again, or call (484) 279-8459.', 'err'); }
    }).render(el);
  }
})();
