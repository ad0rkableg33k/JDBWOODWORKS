/**
 * JDB Woodworks shop dashboard: Google Apps Script backend.
 *
 * Container-bound script: create it from the shop's Google Sheet
 * (Extensions > Apps Script). Data lives in four tabs of that Sheet.
 * Access: deploy as a web app, "Execute as: Me", "Who has access: Anyone within
 * jdbwoodworks.com". On top of that, only the emails in the ALLOWED_EMAILS
 * script property get in (fail closed if it is empty). See SETUP.md.
 */

var STATUSES = ['quote', 'accepted', 'progress', 'ready', 'done', 'cancelled'];

// Column types: s=text, d=date (yyyy-mm-dd text), m=money, i=whole number, b=yes/no, e=status
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

/** Run once from the editor (Run > setup) to create the tabs and grant permissions. */
function setup() {
  withLock_(function () { ensureSheets_(); });
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
