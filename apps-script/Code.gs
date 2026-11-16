/**
 * JDB Woodworks shop dashboard: Google Apps Script backend.
 *
 * Container-bound script: create it from the shop's Google Sheet
 * (Extensions > Apps Script). Data lives in four tabs of that Sheet.
 * Access: deploy as a web app, "Execute as: Me", "Who has access: Anyone within
 * jdbwoodworks.com". On top of that, only the emails in the ALLOWED_EMAILS
 * script property get in (fail closed if it is empty). See SETUP.md.
 */

var STATUSES = ['new', 'quote', 'accepted', 'progress', 'ready', 'done', 'cancelled'];

// Column types: s=text, d=date (yyyy-mm-dd text), m=money, i=whole number, b=yes/no, e=status
// Statuses: new (needs a quote) > quote (quote sent) > accepted > progress > ready > done / cancelled
var TABS = {
  orders: { sheet: 'Orders', cols: [
    ['id', 's'], ['created', 'd'], ['name', 's'], ['phone', 's'], ['email', 's'], ['address', 's'],
    ['request', 's'], ['wood', 's'], ['status', 'e'], ['due', 'd'], ['estPrice', 'm'], ['estTime', 's'],
    ['paid', 'm'], ['paidDate', 'd'], ['materials', 'm'], ['otherCosts', 'm'], ['notes', 's']] },
  inventory: { sheet: 'Inventory', cols: [
    ['id', 's'], ['name', 's'], ['qty', 'i'], ['low', 'i'], ['price', 'm'], ['cost', 'm'],
    ['desc', 's'], ['image', 's'], ['listed', 'b']] },
  expenses: { sheet: 'Expenses', cols: [['id', 's'], ['date', 'd'], ['desc', 's'], ['amount', 'm']] },
  sales: { sheet: 'Sales', cols: [
    ['id', 's'], ['date', 'd'], ['itemId', 's'], ['itemName', 's'], ['price', 'm'], ['cost', 'm']] }
};
var NAMES = ['inventory', 'orders', 'expenses', 'sales'];
var FORMATS = { s: '@', d: '@', m: '#,##0.00', i: '0', b: 'General', e: '@' };
var MAX_TEXT = 2000;
var MAX_OPS = 5000;

/* ---------- web app entry ---------- */

function doGet() {
  try {
    assertAllowed_();
  } catch (e) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:24px">You do not have access to this dashboard. ' +
      'Sign in with your jdbwoodworks.com account, or ask the owner to add you.</p>')
      .setTitle('No access');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('JDB Shop Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- API called from the page (google.script.run) ---------- */

function bootstrap() {
  assertAllowed_();
  return withLock_(function () {
    ensureSheets_();
    return { state: readAll_() };
  });
}

function sync(ops) {
  assertAllowed_();
  return withLock_(function () {
    ensureSheets_();
    applyOps_(ops);
    return { state: readAll_() };
  });
}

/** Saves an item photo to Drive and returns a public image link. */
function uploadPhoto(name, dataUrl) {
  assertAllowed_();
  var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('That is not a supported picture (use JPG, PNG or WebP).');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 3 * 1024 * 1024) throw new Error('That picture is too big.');
  var ext = m[1] === 'image/png' ? '.png' : m[1] === 'image/webp' ? '.webp' : '.jpg';
  var base = String(name || 'photo').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 60) || 'photo';
  var it = DriveApp.getFoldersByName('JDB Shop Photos');
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder('JDB Shop Photos');
  var file = folder.createFile(Utilities.newBlob(bytes, m[1], base + '-' + Date.now() + ext));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { throw new Error('Drive would not make the photo viewable. Link sharing may be turned off for the workspace.'); }
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

/** Run once from the editor (Run > setup) to create the tabs and grant permissions. */
function setup() {
  withLock_(function () { ensureSheets_(); });
}

/* ---------- website quote form -> Orders ----------
 * The Google Form "orders" is linked to this spreadsheet (a "Form Responses" tab appears).
 * A form-submit trigger runs onFormSubmit, which adds each response as a New request in Orders.
 * Insert-only: an order that already exists is never overwritten, so edits in the dashboard are safe.
 */

/** Run once from the editor: makes new form responses show up in Orders. */
function installFormTrigger() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onFormSubmit'; });
  if (has) return 'already installed';
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(SpreadsheetApp.getActive()).onFormSubmit().create();
  return 'installed';
}

/** Run once from the editor: brings in responses that arrived before the trigger existed. */
function importExistingResponses() {
  var sh = SpreadsheetApp.getActive().getSheets().filter(function (x) { return /^Form Responses/.test(x.getName()); })[0];
  if (!sh) throw new Error('No "Form Responses" tab found. Link the form to this spreadsheet first.');
  var data = sh.getDataRange().getValues();
  var head = data[0].map(String);
  var recs = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row.every(function (c) { return c === '' || c == null; })) continue;
    var pairs = head.map(function (h, j) { return [h, cellText_(row[j])]; });
    recs.push(formPairsToOrder_(pairs, sh.getSheetId(), i + 1));
  }
  return addFormOrders_(recs);
}

function onFormSubmit(e) {
  if (!e || !e.namedValues) return;
  var pairs = Object.keys(e.namedValues).map(function (k) {
    var v = e.namedValues[k];
    return [k, cellText_(Array.isArray(v) ? v[0] : v)];
  });
  var sh = e.range && e.range.getSheet ? e.range.getSheet() : null;
  addFormOrders_([formPairsToOrder_(pairs, sh ? sh.getSheetId() : 0, e.range ? e.range.getRow() : 0)]);
}

function cellText_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return v == null ? '' : String(v);
}

/** Turns [[question, answer], ...] into an order record. Matches questions by keywords in their titles. */
function formPairsToOrder_(pairs, sheetId, row) {
  var name = '', phone = '', email = '', type = '', msg = '', ts = '', rest = [];
  pairs.forEach(function (p) {
    var k = String(p[0]).toLowerCase(), v = String(p[1]).trim();
    if (!v) return;
    if (k === 'timestamp') ts = v;
    else if (!email && /e-?mail/.test(k)) email = v;
    else if (!name && /name/.test(k)) name = v;
    else if (!phone && /phone|mobile|cell/.test(k)) phone = v;
    else if (!type && /need|type|kind|service/.test(k)) type = v;
    else if (!msg && /describe|project|message|details|request|about/.test(k)) msg = v;
    else rest.push(p[0] + ': ' + v);
  });
  // The website appends "Email: x" to the message when the visitor gave one.
  var m = msg.match(/\s*Email:\s*(\S+@\S+)\s*$/i);
  if (m) { if (!email) email = m[1]; msg = msg.slice(0, m.index).trim(); }
  if (!msg && rest.length) { msg = rest.join('\n'); rest = []; }
  return {
    id: 'form-' + sheetId + '-' + row,
    created: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    name: name || 'Website visitor',
    phone: phone, email: email,
    request: (type ? type + ': ' : '') + msg,
    status: 'new',
    notes: 'From the website form' + (ts ? ' (' + ts + ')' : '') + (rest.length ? '\n' + rest.join('\n') : '')
  };
}

function addFormOrders_(recs) {
  return withLock_(function () {
    ensureSheets_();
    var have = {};
    readTab_('orders').forEach(function (r) { have[r.id] = true; });
    var fresh = recs.filter(function (r) { return !have[r.id]; });
    if (fresh.length) applyOps_({ upsert: { orders: fresh }, remove: {} });
    return fresh.length;
  });
}

/* ---------- access ---------- */

function allowedEmails_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '';
  return raw.toLowerCase().split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

function assertAllowed_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email || allowedEmails_().indexOf(email) < 0) throw new Error('Not authorized');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- sheet plumbing ---------- */

function ensureSheets_() {
  var ss = SpreadsheetApp.getActive();
  NAMES.forEach(function (name) {
    var def = TABS[name];
    var n = def.cols.length;
    var sh = ss.getSheetByName(def.sheet) || ss.insertSheet(def.sheet);
    var head = sh.getRange(1, 1, 1, n).getValues()[0];
    var empty = head.every(function (c) { return c === '' || c == null; });
    if (empty) {
      sh.getRange(1, 1, 1, n).setValues([def.cols.map(function (c) { return c[0]; })]).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      def.cols.forEach(function (c, i) {
        if (String(head[i]) !== c[0]) {
          throw new Error('Tab "' + def.sheet + '" header ' + (i + 1) + ' should be "' + c[0] + '". Do not rename or move the header row.');
        }
      });
    }
  });
}

function toDateString_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v == null ? '' : v);
}

function readCell_(type, v) {
  switch (type) {
    case 'd': return toDateString_(v);
    case 'm': case 'i': { var n = Number(v); return isFinite(n) ? n : 0; }
    case 'b': return v === true || String(v).toUpperCase() === 'TRUE';
    default: return v == null ? '' : String(v);
  }
}

function readTab_(name) {
  var def = TABS[name];
  var sh = SpreadsheetApp.getActive().getSheetByName(def.sheet);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, def.cols.length).getValues();
  var out = [];
  rows.forEach(function (row) {
    if (row[0] === '' || row[0] == null) return;
    var rec = {};
    def.cols.forEach(function (c, i) { rec[c[0]] = readCell_(c[1], row[i]); });
    out.push(rec);
  });
  return out;
}

function readAll_() {
  var s = {};
  NAMES.forEach(function (n) { s[n] = readTab_(n); });
  return s;
}

function coerce_(type, v) {
  switch (type) {
    case 's': return v == null ? '' : String(v).slice(0, MAX_TEXT);
    case 'd': { var d = String(v == null ? '' : v); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; }
    case 'm': { var m = Number(v); return isFinite(m) ? Math.max(-1e9, Math.min(1e9, Math.round(m * 100) / 100)) : 0; }
    case 'i': { var i = Math.round(Number(v)); return isFinite(i) ? Math.max(0, Math.min(1e6, i)) : 0; }
    case 'b': return v === true || v === 'true';
    case 'e': return STATUSES.indexOf(v) >= 0 ? v : 'quote';
  }
  return '';
}

function cleanRecord_(name, raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Bad record');
  var id = String(raw.id == null ? '' : raw.id);
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error('Bad record id');
  var out = {};
  TABS[name].cols.forEach(function (c) { out[c[0]] = c[0] === 'id' ? id : coerce_(c[1], raw[c[0]]); });
  return out;
}

function writeTab_(name, records) {
  var def = TABS[name];
  var sh = SpreadsheetApp.getActive().getSheetByName(def.sheet);
  var n = def.cols.length;
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, n).clearContent();
  if (!records.length) return;
  var range = sh.getRange(2, 1, records.length, n);
  var fmt = def.cols.map(function (c) { return FORMATS[c[1]]; });
  range.setNumberFormats(records.map(function () { return fmt; }));
  range.setValues(records.map(function (r) { return def.cols.map(function (c) { return r[c[0]]; }); }));
}

function applyOps_(ops) {
  if (!ops || typeof ops !== 'object') throw new Error('Bad request');
  var total = 0;
  NAMES.forEach(function (name) {
    var up = (ops.upsert && ops.upsert[name]) || [];
    var rm = (ops.remove && ops.remove[name]) || [];
    if (!Array.isArray(up) || !Array.isArray(rm)) throw new Error('Bad request');
    total += up.length + rm.length;
  });
  if (total > MAX_OPS) throw new Error('Too many changes at once');

  // Validate and clean everything first, so a bad record in any tab means nothing at all is written.
  var plan = {};
  NAMES.forEach(function (name) {
    var up = (ops.upsert && ops.upsert[name]) || [];
    var rm = (ops.remove && ops.remove[name]) || [];
    if (!up.length && !rm.length) return;
    plan[name] = { up: up.map(function (raw) { return cleanRecord_(name, raw); }), rm: rm.map(String) };
  });

  Object.keys(plan).forEach(function (name) {
    var removeSet = {};
    plan[name].rm.forEach(function (id) { removeSet[id] = true; });
    var records = readTab_(name).filter(function (r) { return !removeSet[r.id]; });

    var index = {};
    records.forEach(function (r, i) { index[r.id] = i; });
    plan[name].up.forEach(function (rec) {
      if (Object.prototype.hasOwnProperty.call(index, rec.id)) records[index[rec.id]] = rec;
      else { index[rec.id] = records.length; records.push(rec); }
    });
    writeTab_(name, records);
  });
}
