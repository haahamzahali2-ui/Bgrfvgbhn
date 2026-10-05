// ═══════════════════════════════════
// MCAT Prep Tracker — Google Sheets sync
// Paste this whole file into Extensions → Apps Script in your Google Sheet,
// then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
// Keep the web app URL private: anyone who has it can read and change your data.
// ═══════════════════════════════════

var CHUNK = 40000; // Sheets cells hold up to 50,000 characters

function doGet() {
  return json_(load_());
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.action !== 'save') return json_({ ok: false, error: 'Unknown action' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    saveBackup_(ss, body.data, body.updatedAt);
    var tables = body.tables || {};
    Object.keys(tables).forEach(function (name) { writeTable_(ss, name, tables[name]); });
    return json_({ ok: true, updatedAt: body.updatedAt });
  } finally {
    lock.releaseLock();
  }
}

// The full app data, split across cells. Each chunk starts with "~" so Sheets never reads it as a formula.
function saveBackup_(ss, data, updatedAt) {
  var sh = ss.getSheetByName('_backup') || ss.insertSheet('_backup');
  var rows = [];
  for (var i = 0; i < data.length; i += CHUNK) rows.push(['~' + data.slice(i, i + CHUNK)]);
  sh.clear();
  sh.getRange(1, 1, 1, 2).setValues([['updatedAt', String(updatedAt)]]);
  if (rows.length) sh.getRange(2, 1, rows.length, 1).setValues(rows);
  sh.hideSheet();
}

function load_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_backup');
  if (!sh || sh.getLastRow() < 2) return { ok: true, updatedAt: 0, data: null };
  var updatedAt = Number(sh.getRange(1, 2).getValue()) || 0;
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).slice(1); }).join('');
  return { ok: true, updatedAt: updatedAt, data: data };
}

// Readable tabs (Passages, Mistakes, Exams) — for looking at your data in Sheets
function writeTable_(ss, name, rows) {
  if (!rows || !rows.length) return;
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  var safe = rows.map(function (r) {
    return r.map(function (v) {
      var s = v === null || v === undefined ? '' : v;
      return (typeof s === 'string' && /^[=+\-@]/.test(s)) ? "'" + s : s;
    });
  });
  sh.getRange(1, 1, safe.length, safe[0].length).setValues(safe);
  sh.getRange(1, 1, 1, safe[0].length).setFontWeight('bold').setBackground('#F5EDD6');
  sh.setFrozenRows(1);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
