// JDB Woodworks shop dashboard. Vanilla JS, no dependencies.
// Data lives in this browser's localStorage only. It is never sent anywhere.
(function () {
  'use strict';

  var KEY = 'jdb-dashboard-v1';
  var BACKUP_NAG_DAYS = 14;
  var STATUS = {
    quote: 'Quote', accepted: 'Accepted', progress: 'In progress',
    ready: 'Ready', done: 'Complete', cancelled: 'Cancelled'
  };
  var OPEN = { quote: 1, accepted: 1, progress: 1, ready: 1 };
  var OWED = { accepted: 1, progress: 1, ready: 1 };

  var storageOK = true;
  var state = load();

  // ---------- helpers ----------
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  var fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  function money(n) { return fmt.format(n || 0); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return isoDate(new Date()); }
  function niceDate(s) {
    if (!s) return '';
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function signed(n) { return '<span class="' + (n < 0 ? 'neg' : 'pos') + '">' + money(n) + '</span>'; }

  // ---------- storage ----------
  function blank() { return { inventory: [], orders: [], expenses: [], sales: [], meta: { lastBackup: '' } }; }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      return normalize(JSON.parse(raw));
    } catch (e) {
      storageOK = false;
      return blank();
    }
  }
  function normalize(d) {
    var b = blank();
    if (!d || typeof d !== 'object') return b;
    ['inventory', 'orders', 'expenses', 'sales'].forEach(function (k) {
      b[k] = Array.isArray(d[k]) ? d[k].filter(function (x) { return x && typeof x === 'object'; }) : [];
    });
    if (d.meta && typeof d.meta.lastBackup === 'string') b.meta.lastBackup = d.meta.lastBackup;
    return b;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { storageOK = false; }
    renderAll();
  }

  // ---------- money math ----------
  function orderDate(o) { return o.paidDate || o.created || today(); }
  function orderCosts(o) { return num(o.materials) + num(o.otherCosts); }
  function orderProfit(o) { return num(o.paid) - orderCosts(o); }

  function rangeStart(r) {
    var d = new Date();
    if (r === 'month') return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
    if (r === 'ytd') return isoDate(new Date(d.getFullYear(), 0, 1));
    if (r === '30') { d.setDate(d.getDate() - 30); return isoDate(d); }
    return '0000-00-00';
  }
  function totals(from, to) {
    var t = { revenue: 0, costs: 0 };
    state.orders.forEach(function (o) {
      var d = orderDate(o);
      if (d >= from && d <= to) { t.revenue += num(o.paid); t.costs += orderCosts(o); }
    });
    state.sales.forEach(function (s) {
      if (s.date >= from && s.date <= to) { t.revenue += num(s.price); t.costs += num(s.cost); }
    });
    state.expenses.forEach(function (x) {
      if (x.date >= from && x.date <= to) t.costs += num(x.amount);
    });
    t.profit = t.revenue - t.costs;
    return t;
  }

  // ---------- tabs ----------
  var TABS = ['overview', 'orders', 'inventory', 'expenses', 'backup'];
  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'overview';
    TABS.forEach(function (t) { $('#tab-' + t).hidden = t !== name; });
    $$('#tabs button').forEach(function (b) {
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) showTab(g.dataset.go);
  });

  // ---------- overview ----------
  function renderOverview() {
    var r = $('#range').value;
    var t = totals(rangeStart(r), '9999-99-99');

    var owed = 0, open = 0;
    state.orders.forEach(function (o) {
      if (OPEN[o.status]) open++;
      if (OWED[o.status]) owed += Math.max(0, num(o.estPrice) - num(o.paid));
    });
    var units = 0, retail = 0;
    state.inventory.forEach(function (i) { units += num(i.qty); retail += num(i.qty) * num(i.price); });

    $('#stats').innerHTML =
      stat('Revenue', money(t.revenue), 'cash actually received') +
      stat('Costs', money(t.costs), 'materials, expenses, stock sold') +
      stat('Profit', signed(t.profit), t.revenue ? Math.round((t.profit / t.revenue) * 100) + '% margin' : 'no revenue yet') +
      stat('Still owed', money(owed), 'on accepted / in-progress / ready orders') +
      stat('Open orders', String(open), 'quotes and active jobs') +
      stat('Stock on hand', String(units) + ' unit' + (units === 1 ? '' : 's'), money(retail) + ' at retail');

    renderChart();
    renderAttention();
  }
  function stat(k, v, s) {
    return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div><div class="s">' + esc(s) + '</div></div>';
  }

  function renderChart() {
    var now = new Date(), months = [], i;
    for (i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var from = isoDate(d);
      var to = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      months.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), profit: totals(from, to).profit });
    }
    var max = Math.max.apply(null, months.map(function (m) { return Math.abs(m.profit); }));
    var el = $('#chart');
    if (!max) { el.innerHTML = '<p class="chart-empty">Nothing to chart yet.</p>'; return; }
    var hasLoss = months.some(function (m) { return m.profit < 0; });
    el.innerHTML = months.map(function (m) {
      var h = Math.max(2, Math.round((Math.abs(m.profit) / max) * (hasLoss ? 70 : 140)));
      var up = m.profit >= 0;
      return '<div class="col">' +
        '<div class="zone">' + (up ? '<span class="amt">' + money(m.profit) + '</span><div class="bar" style="height:' + h + 'px"></div>' : '') + '</div>' +
        (hasLoss ? '<div class="zone down">' + (!up ? '<div class="bar loss" style="height:' + h + 'px"></div><span class="amt">' + money(m.profit) + '</span>' : '') + '</div>' : '') +
        '<span class="mo">' + esc(m.label) + '</span></div>';
    }).join('');
  }

  function renderAttention() {
    var items = [], t = today();
    state.orders.forEach(function (o) {
      if (!OPEN[o.status]) return;
      if (o.due && o.due < t) items.push({ warn: 1, text: esc(o.name) + ': past due', sub: 'Was due ' + niceDate(o.due) + ' (' + STATUS[o.status] + ')' });
      else if (o.status === 'ready') {
        var bal = num(o.estPrice) - num(o.paid);
        items.push({ text: esc(o.name) + ': ready for pickup', sub: bal > 0 ? money(bal) + ' still owed' : 'Paid in full' });
      }
    });
    state.inventory.forEach(function (i) {
      if (num(i.qty) <= num(i.low)) items.push({ warn: 1, text: esc(i.name) + ': ' + (num(i.qty) === 0 ? 'out of stock' : 'low stock'), sub: num(i.qty) + ' left' });
    });
    $('#attention').innerHTML = items.length
      ? '<ul>' + items.map(function (x) { return '<li class="' + (x.warn ? 'warn' : '') + '">' + x.text + '<small>' + esc(x.sub) + '</small></li>'; }).join('') + '</ul>'
      : '<p class="hint">All clear. Suspicious, but all clear.</p>';
  }

  // ---------- orders ----------
  function renderOrders() {
    var q = $('#order-search').value.trim().toLowerCase();
    var f = $('#order-filter').value;
    var rows = state.orders.filter(function (o) {
      if (f === 'active' && !OPEN[o.status]) return false;
      if (!q) return true;
      return [o.name, o.phone, o.email, o.address, o.request, o.wood].join(' ').toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return (a.due || '9999').localeCompare(b.due || '9999') || (b.created || '').localeCompare(a.created || '');
    });
    $('#orders-empty').hidden = rows.length > 0;
    $('#orders-empty').textContent = state.orders.length ? 'No orders match.' : 'No orders yet. Hit “New order” to add the first one.';
    $('#orders-table').hidden = rows.length === 0;
    $('#orders-table tbody').innerHTML = rows.map(function (o) {
      var contact = [o.phone, o.email].filter(Boolean).map(esc).join('<br>');
      return '<tr>' +
        '<td><strong>' + esc(o.name) + '</strong><small>' + contact + '</small></td>' +
        '<td><div class="req">' + esc(o.request) + '</div></td>' +
        '<td>' + esc(o.wood) + '</td>' +
        '<td><span class="pill ' + esc(o.status) + '">' + esc(STATUS[o.status] || o.status) + '</span></td>' +
        '<td class="num">' + (num(o.estPrice) ? money(num(o.estPrice)) : '') + '<small>' + esc(o.estTime) + '</small></td>' +
        '<td class="num">' + money(num(o.paid)) + '</td>' +
        '<td class="num">' + signed(orderProfit(o)) + '</td>' +
        '<td>' + esc(niceDate(o.due)) + '</td>' +
        '<td><div class="row-actions"><button type="button" data-edit-order="' + esc(o.id) + '">Edit</button>' +
        '<button type="button" class="danger" data-del-order="' + esc(o.id) + '">Delete</button></div></td>' +
        '</tr>';
    }).join('');
  }
  $('#order-search').addEventListener('input', renderOrders);
  $('#order-filter').addEventListener('change', renderOrders);
  $('#new-order').addEventListener('click', function () { orderDialog(null); });
  $('#orders-table').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit-order]');
    var dl = e.target.closest('[data-del-order]');
    if (ed) orderDialog(find(state.orders, ed.dataset.editOrder));
    if (dl) {
      var o = find(state.orders, dl.dataset.delOrder);
      if (o && confirm('Delete the order for ' + o.name + '? This cannot be undone.')) {
        state.orders = state.orders.filter(function (x) { return x.id !== o.id; });
        save();
      }
    }
  });

  function find(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }

  function opt(map, sel) {
    return Object.keys(map).map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(map[k]) + '</option>';
    }).join('');
  }
  function field(label, name, val, attrs, cls) {
    return '<label class="f ' + (cls || '') + '"><span>' + esc(label) + '</span><input name="' + name + '" value="' + esc(val) + '" ' + (attrs || '') + '></label>';
  }
  function money_f(label, name, val) {
    return field(label, name, val === 0 || val === '' || val == null ? '' : val, 'type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"');
  }

  function orderDialog(o) {
    var isNew = !o;
    o = o || { status: 'quote', created: today() };
    openDialog(isNew ? 'New order' : 'Edit order',
      '<div class="grid2">' + field('Customer name *', 'name', o.name || '', 'type="text" required autocomplete="off"') +
      field('Phone', 'phone', o.phone || '', 'type="tel" autocomplete="off"') + '</div>' +
      '<div class="grid2">' + field('Email', 'email', o.email || '', 'type="email" autocomplete="off"') +
      field('Address', 'address', o.address || '', 'type="text" autocomplete="off"') + '</div>' +
      '<label class="f"><span>Request *</span><textarea name="request" rows="3" required>' + esc(o.request || '') + '</textarea></label>' +
      '<div class="grid3">' + field('Type of wood', 'wood', o.wood || '', 'type="text" placeholder="Oak, walnut…"') +
      '<label class="f"><span>Status</span><select name="status">' + opt(STATUS, o.status) + '</select></label>' +
      field('Due date', 'due', o.due || '', 'type="date"') + '</div>' +
      '<div class="grid3">' + money_f('Est. price', 'estPrice', o.estPrice) +
      field('Est. time', 'estTime', o.estTime || '', 'type="text" placeholder="2 weeks"') +
      field('Date created', 'created', o.created || today(), 'type="date"') + '</div>' +
      '<div class="grid3">' + money_f('Actual paid', 'paid', o.paid) +
      field('Paid on', 'paidDate', o.paidDate || '', 'type="date"') +
      money_f('Materials cost', 'materials', o.materials) + '</div>' +
      '<div class="grid2">' + money_f('Other costs (hardware, delivery…)', 'otherCosts', o.otherCosts) + '<div></div></div>' +
      '<div class="calc" id="calc"></div>' +
      '<label class="f"><span>Notes</span><textarea name="notes" rows="2">' + esc(o.notes || '') + '</textarea></label>',
      function (fd) {
        var name = fd.get('name').trim(), request = fd.get('request').trim();
        if (!name || !request) return 'Customer name and request are required.';
        var rec = o.id ? o : { id: uid() };
        rec.name = name; rec.request = request;
        rec.phone = fd.get('phone').trim(); rec.email = fd.get('email').trim(); rec.address = fd.get('address').trim();
        rec.wood = fd.get('wood').trim(); rec.status = fd.get('status');
        rec.due = fd.get('due'); rec.estPrice = num(fd.get('estPrice')); rec.estTime = fd.get('estTime').trim();
        rec.created = fd.get('created') || today();
        rec.paid = num(fd.get('paid')); rec.paidDate = fd.get('paidDate');
        if (rec.paid > 0 && !rec.paidDate) rec.paidDate = today();
        rec.materials = num(fd.get('materials')); rec.otherCosts = num(fd.get('otherCosts'));
        rec.notes = fd.get('notes').trim();
        if (!o.id) state.orders.push(rec);
        return null;
      });
    var form = $('#dlg-form');
    function calc() {
      var paid = num(form.elements.paid.value), est = num(form.elements.estPrice.value);
      var cost = num(form.elements.materials.value) + num(form.elements.otherCosts.value);
      $('#calc').innerHTML = 'Profit so far: ' + signed(paid - cost) + ' &nbsp;·&nbsp; Balance on estimate: <strong>' + money(Math.max(0, est - paid)) + '</strong>';
    }
    form.addEventListener('input', calc);
    calc();
  }

  // ---------- inventory ----------
  function renderInventory() {
    var rows = state.inventory.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('#inv-empty').hidden = rows.length > 0;
    $('#inv-table').hidden = rows.length === 0;
    $('#inv-table tbody').innerHTML = rows.map(function (i) {
      var low = num(i.qty) <= num(i.low);
      var margin = num(i.price) - num(i.cost);
      return '<tr class="' + (low ? 'low' : '') + '">' +
        '<td><strong>' + esc(i.name) + '</strong>' + (low ? '<small class="neg">' + (num(i.qty) === 0 ? 'Out of stock' : 'Low stock') + '</small>' : '') + (i.listed ? '<small>In online store</small>' : '') + '</td>' +
        '<td class="num"><span class="qty"><button type="button" aria-label="One less" data-dec="' + esc(i.id) + '">−</button><b>' + num(i.qty) + '</b><button type="button" aria-label="One more" data-inc="' + esc(i.id) + '">+</button></span></td>' +
        '<td class="num">' + money(num(i.price)) + '</td>' +
        '<td class="num">' + money(num(i.cost)) + '</td>' +
        '<td class="num">' + signed(margin) + '</td>' +
        '<td><div class="row-actions"><button type="button" data-sell="' + esc(i.id) + '">Sold 1</button>' +
        '<button type="button" data-edit-item="' + esc(i.id) + '">Edit</button>' +
        '<button type="button" class="danger" data-del-item="' + esc(i.id) + '">Delete</button></div></td></tr>';
    }).join('');
  }
  $('#new-item').addEventListener('click', function () { itemDialog(null); });
  $('#inv-table').addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var id = t.dataset.inc || t.dataset.dec || t.dataset.sell || t.dataset.editItem || t.dataset.delItem;
    var i = find(state.inventory, id);
    if (!i) return;
    if (t.dataset.inc) { i.qty = num(i.qty) + 1; save(); }
    else if (t.dataset.dec) { i.qty = Math.max(0, num(i.qty) - 1); save(); }
    else if (t.dataset.sell) {
      if (num(i.qty) < 1) { alert(i.name + ' is out of stock.'); return; }
      i.qty = num(i.qty) - 1;
      state.sales.push({ id: uid(), date: today(), itemId: i.id, itemName: i.name, price: num(i.price), cost: num(i.cost) });
      save();
    }
    else if (t.dataset.editItem) itemDialog(i);
    else if (t.dataset.delItem && confirm('Delete ' + i.name + ' from inventory? Past sales stay in your totals.')) {
      state.inventory = state.inventory.filter(function (x) { return x.id !== i.id; });
      save();
    }
  });
  function itemDialog(i) {
    var isNew = !i;
    i = i || { qty: 1, low: 1 };
    openDialog(isNew ? 'New item' : 'Edit item',
      field('Item name *', 'name', i.name || '', 'type="text" required placeholder="Bottle opener, maple" autocomplete="off"') +
      '<div class="grid2">' + field('In stock', 'qty', i.qty, 'type="number" step="1" min="0" inputmode="numeric"') +
      field('Low-stock warning at', 'low', i.low, 'type="number" step="1" min="0" inputmode="numeric"') + '</div>' +
      '<div class="grid2">' + money_f('Sale price', 'price', i.price) + money_f('Cost to make', 'cost', i.cost) + '</div>' +
      '<label class="f"><span>Store description</span><textarea name="desc" rows="2" placeholder="Shown on the public store page">' + esc(i.desc || '') + '</textarea></label>' +
      '<div class="grid2">' + field('Photo file name', 'image', i.image || '', 'type="text" placeholder="maple-bottle-opener.png" autocomplete="off"') +
      '<label class="f"><span>Online store</span><select name="listed"><option value="no"' + (i.listed ? '' : ' selected') + '>Not listed</option><option value="yes"' + (i.listed ? ' selected' : '') + '>List in store</option></select></label></div>',
      function (fd) {
        var name = fd.get('name').trim();
        if (!name) return 'Item name is required.';
        var rec = i.id ? i : { id: uid() };
        rec.name = name;
        rec.qty = Math.max(0, Math.round(num(fd.get('qty'))));
        rec.low = Math.max(0, Math.round(num(fd.get('low'))));
        rec.price = num(fd.get('price')); rec.cost = num(fd.get('cost'));
        rec.desc = fd.get('desc').trim(); rec.image = fd.get('image').trim().replace(/^.*[\\/]/, '');
        rec.listed = fd.get('listed') === 'yes';
        if (rec.listed && !(rec.price > 0)) return 'A listed item needs a sale price.';
        if (!i.id) state.inventory.push(rec);
        return null;
      });
  }

  // ---------- expenses ----------
  function renderExpenses() {
    var rows = state.expenses.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    $('#exp-empty').hidden = rows.length > 0;
    $('#exp-table').hidden = rows.length === 0;
    $('#exp-table tbody').innerHTML = rows.map(function (x) {
      return '<tr><td>' + esc(niceDate(x.date)) + '</td><td>' + esc(x.desc) + '</td><td class="num">' + money(num(x.amount)) + '</td>' +
        '<td><div class="row-actions"><button type="button" data-edit-exp="' + esc(x.id) + '">Edit</button>' +
        '<button type="button" class="danger" data-del-exp="' + esc(x.id) + '">Delete</button></div></td></tr>';
    }).join('');
  }
  $('#new-expense').addEventListener('click', function () { expDialog(null); });
  $('#exp-table').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit-exp]'), dl = e.target.closest('[data-del-exp]');
    if (ed) expDialog(find(state.expenses, ed.dataset.editExp));
    if (dl) {
      var x = find(state.expenses, dl.dataset.delExp);
      if (x && confirm('Delete this expense?')) { state.expenses = state.expenses.filter(function (y) { return y.id !== x.id; }); save(); }
    }
  });
  function expDialog(x) {
    var isNew = !x;
    x = x || { date: today() };
    openDialog(isNew ? 'New expense' : 'Edit expense',
      field('What was it? *', 'desc', x.desc || '', 'type="text" required placeholder="Table saw blade" autocomplete="off"') +
      '<div class="grid2">' + money_f('Amount *', 'amount', x.amount) + field('Date', 'date', x.date, 'type="date"') + '</div>',
      function (fd) {
        var desc = fd.get('desc').trim(), amt = num(fd.get('amount'));
        if (!desc || !amt) return 'Add a description and an amount.';
        var rec = x.id ? x : { id: uid() };
        rec.desc = desc; rec.amount = amt; rec.date = fd.get('date') || today();
        if (!x.id) state.expenses.push(rec);
        return null;
      });
  }

  // ---------- dialog ----------
  var dlg = $('#dlg'), onSave = null;
  function openDialog(title, html, handler) {
    $('#dlg-title').textContent = title;
    $('#dlg-body').innerHTML = html;
    $('#dlg-err').hidden = true;
    onSave = handler;
    if (!dlg.open) dlg.showModal();
    var first = $('#dlg-body input, #dlg-body textarea');
    if (first) first.focus();
  }
  $('#dlg-cancel').addEventListener('click', function () { dlg.close(); });
  $('#dlg-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = onSave && onSave(new FormData($('#dlg-form')));
    if (err) { var el = $('#dlg-err'); el.textContent = err; el.hidden = false; return; }
    dlg.close();
    save();
  });

  // ---------- store publish ----------
  $('#export-store').addEventListener('click', function () {
    var items = state.inventory.filter(function (i) { return i.listed; }).map(function (i) {
      return { id: i.id, name: i.name, price: num(i.price), qty: num(i.qty), description: i.desc || '', image: i.image || '' };
    });
    if (!items.length) { alert('Nothing is set to “List in store” yet. Edit an item and turn it on.'); return; }
    download('products.json', JSON.stringify({ updated: today(), products: items }, null, 2), 'application/json');
  });

  // ---------- backup ----------
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  $('#export-json').addEventListener('click', function () {
    state.meta.lastBackup = today();
    download('jdb-dashboard-backup-' + today() + '.json', JSON.stringify(state, null, 2), 'application/json');
    save();
  });
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $('#export-csv').addEventListener('click', function () {
    var cols = [['Created', 'created'], ['Customer', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Address', 'address'],
      ['Request', 'request'], ['Wood', 'wood'], ['Status', 'status'], ['Est. price', 'estPrice'], ['Est. time', 'estTime'],
      ['Due', 'due'], ['Paid', 'paid'], ['Paid on', 'paidDate'], ['Materials', 'materials'], ['Other costs', 'otherCosts'], ['Notes', 'notes']];
    var lines = [cols.map(function (c) { return csvCell(c[0]); }).concat(csvCell('Profit')).join(',')];
    state.orders.forEach(function (o) {
      lines.push(cols.map(function (c) { return csvCell(c[1] === 'status' ? STATUS[o.status] : o[c[1]]); }).concat(csvCell(orderProfit(o).toFixed(2))).join(','));
    });
    download('jdb-orders-' + today() + '.csv', lines.join('\r\n'), 'text/csv');
  });
  $('#import-json').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var data = JSON.parse(rd.result);
        if (!data || typeof data !== 'object' || !['inventory', 'orders', 'expenses', 'sales'].some(function (k) { return Array.isArray(data[k]); })) throw new Error('shape');
        var n = normalize(data);
        if (!confirm('Replace everything on this page with this backup (' + n.orders.length + ' orders, ' + n.inventory.length + ' items, ' + n.expenses.length + ' expenses)?')) return;
        state = n;
        save();
      } catch (err) {
        alert('That file is not a valid dashboard backup.');
      }
    };
    rd.readAsText(file);
  });

  function renderBackup() {
    var has = state.orders.length + state.inventory.length + state.expenses.length + state.sales.length > 0;
    var lb = state.meta.lastBackup;
    $('#last-backup').textContent = lb ? 'Last backup: ' + niceDate(lb) : 'No backup downloaded yet.';
    var days = lb ? Math.floor((new Date(today()) - new Date(lb)) / 86400000) : Infinity;
    var banner = $('#backup-banner');
    var msg = !storageOK ? 'This browser is blocking saved data, so nothing you enter will stick. Try a normal (non-private) window.'
      : has && days >= BACKUP_NAG_DAYS ? (lb ? 'It has been ' + days + ' days since your last backup.' : 'You have data here but no backup yet.') : '';
    banner.hidden = !msg;
    $('#backup-banner-text').textContent = msg;
  }

  // ---------- init ----------
  function renderAll() {
    renderOverview(); renderOrders(); renderInventory(); renderExpenses(); renderBackup();
  }
  $('#range').addEventListener('change', renderOverview);
  window.addEventListener('hashchange', function () { showTab(location.hash.slice(1)); });
  renderAll();
  showTab(location.hash.slice(1));
})();
