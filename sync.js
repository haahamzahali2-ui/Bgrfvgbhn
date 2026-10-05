// ═══════════════════════════════════
// GOOGLE SHEET SYNC — every save also goes to your own Google Sheet,
// so your data survives a wiped browser and follows you to any device.
// Newest copy wins: the app pulls on load and pushes ~1.5s after each change.
// ═══════════════════════════════════

const SYNC_URL_KEY = 'mcat_sheet_url';
const SYNC_BACKUP_KEY = 'mcat_prep_data_before_sync';
let syncTimer = null;
let syncBusy = false;
let syncQueued = false;
let syncState = { status: 'off', at: null, error: '' };

// Apps Script code shown in the setup guide (same as google-apps-script.gs in the repo)
const SHEET_SCRIPT = "// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n// MCAT Prep Tracker \u2014 Google Sheets sync\n// Paste this whole file into Extensions \u2192 Apps Script in your Google Sheet,\n// then Deploy \u2192 New deployment \u2192 Web app (Execute as: Me, Who has access: Anyone).\n// Keep the web app URL private: anyone who has it can read and change your data.\n// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nvar CHUNK = 40000; // Sheets cells hold up to 50,000 characters\n\nfunction doGet() {\n  return json_(load_());\n}\n\nfunction doPost(e) {\n  var body = JSON.parse(e.postData.contents);\n  if (body.action !== 'save') return json_({ ok: false, error: 'Unknown action' });\n  var lock = LockService.getScriptLock();\n  lock.waitLock(20000);\n  try {\n    var ss = SpreadsheetApp.getActiveSpreadsheet();\n    saveBackup_(ss, body.data, body.updatedAt);\n    var tables = body.tables || {};\n    Object.keys(tables).forEach(function (name) { writeTable_(ss, name, tables[name]); });\n    return json_({ ok: true, updatedAt: body.updatedAt });\n  } finally {\n    lock.releaseLock();\n  }\n}\n\n// The full app data, split across cells. Each chunk starts with \"~\" so Sheets never reads it as a formula.\nfunction saveBackup_(ss, data, updatedAt) {\n  var sh = ss.getSheetByName('_backup') || ss.insertSheet('_backup');\n  var rows = [];\n  for (var i = 0; i < data.length; i += CHUNK) rows.push(['~' + data.slice(i, i + CHUNK)]);\n  sh.clear();\n  sh.getRange(1, 1, 1, 2).setValues([['updatedAt', String(updatedAt)]]);\n  if (rows.length) sh.getRange(2, 1, rows.length, 1).setValues(rows);\n  sh.hideSheet();\n}\n\nfunction load_() {\n  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_backup');\n  if (!sh || sh.getLastRow() < 2) return { ok: true, updatedAt: 0, data: null };\n  var updatedAt = Number(sh.getRange(1, 2).getValue()) || 0;\n  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()\n    .map(function (r) { return String(r[0]).slice(1); }).join('');\n  return { ok: true, updatedAt: updatedAt, data: data };\n}\n\n// Readable tabs (Passages, Mistakes, Exams) \u2014 for looking at your data in Sheets\nfunction writeTable_(ss, name, rows) {\n  if (!rows || !rows.length) return;\n  var sh = ss.getSheetByName(name) || ss.insertSheet(name);\n  sh.clear();\n  var safe = rows.map(function (r) {\n    return r.map(function (v) {\n      var s = v === null || v === undefined ? '' : v;\n      return (typeof s === 'string' && /^[=+\\-@]/.test(s)) ? \"'\" + s : s;\n    });\n  });\n  sh.getRange(1, 1, safe.length, safe[0].length).setValues(safe);\n  sh.getRange(1, 1, 1, safe[0].length).setFontWeight('bold').setBackground('#F5EDD6');\n  sh.setFrozenRows(1);\n}\n\nfunction json_(obj) {\n  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);\n}\n";

function getSyncUrl() { try { return localStorage.getItem(SYNC_URL_KEY) || ''; } catch(e) { return ''; } }

function isValidSyncUrl(u) { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u); }

function setSyncStatus(status, error = '') {
  syncState = { status, at: status === 'ok' ? new Date() : syncState.at, error };
  const dot = document.getElementById('syncBtn');
  if (dot) {
    dot.className = 'dark-toggle sync-btn ' + status;
    dot.title = { off: 'Google Sheet sync is off — click to set up', pending: 'Saving to Google Sheet…', syncing: 'Syncing with Google Sheet…', ok: 'Saved to Google Sheet', error: 'Google Sheet sync failed — click for details' }[status];
  }
  const txt = document.getElementById('syncStatusText');
  if (txt) {
    txt.className = 'sync-status ' + status;
    txt.textContent = status === 'off' ? 'Not connected'
      : status === 'error' ? `Couldn't sync — ${error || 'check your connection'}`
      : status === 'ok' ? `Synced ${syncState.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : 'Syncing…';
  }
}

// Called by saveDB() after every change
function markSyncDirty() {
  if (!getSyncUrl()) return;
  setSyncStatus('pending');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToSheet, 1500);
}

// Human-readable tabs written next to the raw backup
function buildSheetTables() {
  const sec = k => getSection(k).short;
  const passages = [['Date', 'Section', 'Subject', 'Provider', 'Passage', 'Link', 'Correct', 'Total', 'Accuracy %', 'Minutes', 'Misses explained', 'Notes']]
    .concat([...db.sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(s => [
      s.date, sec(s.section), s.subject, s.provider, s.topic || '', getSessionLinks(s).join(' '), s.correct, s.total,
      pct(s.correct, s.total), s.minutes || '', getMistakesForSession(s.id).length, s.notes || ''
    ]));
  const mistakes = [['Date', 'Section', 'Subject', 'Provider', 'Q#', 'You picked', 'Correct', 'What went wrong', 'Root cause', 'Concept', 'Question', 'What happened', 'Takeaway', 'Link']]
    .concat([...db.mistakes].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(m => [
      m.date, sec(m.section), m.subject, m.provider, m.questionRef || '', m.myAnswer || '', m.correctAnswer || '',
      getErrorType(m.errorType).label, getMistakeBucket(m).label, m.concept || '', m.question || '', m.what || '', m.takeaway || '', m.link || ''
    ]));
  const exams = [['Date', 'Exam', 'Provider', 'C/P', 'CARS', 'B/B', 'P/S', 'Total', 'Notes']]
    .concat(getSortedFLs().reverse().map(f => [f.date, f.name || '', f.provider, f.cp, f.cars, f.bb, f.ps, getFLTotal(f), f.notes || '']));
  return { Passages: passages, Mistakes: mistakes, Exams: exams };
}

async function pushToSheet() {
  syncTimer = null;
  const url = getSyncUrl();
  if (!url) return;
  if (syncBusy) { syncQueued = true; return; }
  syncBusy = true;
  setSyncStatus('syncing');
  try {
    if (!db.updatedAt) db.updatedAt = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // keeps it a "simple" request (no CORS preflight)
      body: JSON.stringify({ action: 'save', updatedAt: db.updatedAt, data: JSON.stringify(db), tables: buildSheetTables() })
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'the sheet said no');
    setSyncStatus('ok');
  } catch(e) {
    setSyncStatus('error', e.message === 'Failed to fetch' ? 'no connection' : e.message);
  } finally {
    syncBusy = false;
    if (syncQueued) { syncQueued = false; pushToSheet(); }
  }
}

// Fetch the sheet's copy. If it's newer than this browser's, use it (keeping a local safety copy).
async function pullFromSheet({ announce = false } = {}) {
  const url = getSyncUrl();
  if (!url) { setSyncStatus('off'); return; }
  setSyncStatus('syncing');
  try {
    const res = await fetch(url);
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'the sheet said no');
    const remoteAt = Number(out.updatedAt) || 0;
    const localAt = Number(db.updatedAt) || 0;
    if (out.data && remoteAt > localAt) {
      const remote = JSON.parse(out.data);
      if (!remote || !Array.isArray(remote.sessions)) throw new Error('sheet data looks damaged');
      try { localStorage.setItem(SYNC_BACKUP_KEY, JSON.stringify(db)); } catch(e) {}
      db = remote; normalizeDB();
      db.updatedAt = remoteAt;
      saveDB(false);
      setSyncStatus('ok');
      refreshAll();
      if (announce) showToast(`☁️ Loaded your data from Google Sheets (${plural(db.sessions.length, 'passage')})`);
    } else if (!out.data || localAt > remoteAt) {
      setSyncStatus('ok');
      await pushToSheet();
      if (announce) showToast('☁️ Connected — your data is now saved to Google Sheets');
    } else {
      setSyncStatus('ok');
      if (announce) showToast('☁️ Everything is in sync');
    }
  } catch(e) {
    setSyncStatus('error', e.message === 'Failed to fetch' ? 'no connection' : e.message);
    if (announce) showToast('Couldn\'t reach the Google Sheet — double-check the URL and that access is set to "Anyone".');
  }
}

// ═══════════════════════════════════
// SETTINGS ACTIONS
// ═══════════════════════════════════
function connectSheet() {
  const input = document.getElementById('set-sheet-url');
  const url = input.value.trim();
  if (!isValidSyncUrl(url)) {
    showToast('That doesn\'t look like a web app URL — it should start with https://script.google.com/macros/s/ and end in /exec');
    input.focus();
    return;
  }
  try { localStorage.setItem(SYNC_URL_KEY, url); } catch(e) {}
  renderSyncSettings();
  pullFromSheet({ announce: true });
}

function disconnectSheet() {
  try { localStorage.removeItem(SYNC_URL_KEY); } catch(e) {}
  clearTimeout(syncTimer);
  setSyncStatus('off');
  renderSyncSettings();
  showToast('Disconnected. Your data stays in this browser and in the Sheet.');
}

function syncNow() { pullFromSheet({ announce: true }); }

function renderSyncSettings() {
  const url = getSyncUrl();
  const input = document.getElementById('set-sheet-url');
  if (!input) return;
  input.value = url;
  document.getElementById('syncConnected').style.display = url ? 'flex' : 'none';
  document.getElementById('syncConnectBtn').textContent = url ? 'Update' : 'Connect';
  setSyncStatus(url ? (syncState.status === 'off' ? 'ok' : syncState.status) : 'off', syncState.error);
}

function openSyncHelp() { openModal('syncHelpModal'); }

function copySyncScript(btn) {
  const done = () => { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '📋 Copy the script'; }, 2000); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(SHEET_SCRIPT).then(done, () => fallbackCopy(done));
  else fallbackCopy(done);
}

function fallbackCopy(done) {
  const ta = document.getElementById('syncScriptText');
  ta.style.display = 'block'; ta.value = SHEET_SCRIPT; ta.select();
  try { document.execCommand('copy'); done(); } catch(e) { showToast('Select the text below and copy it'); }
}

// Re-check the sheet when you come back to the tab (e.g. after logging on your phone)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && getSyncUrl() && !syncTimer && !syncBusy) pullFromSheet();
});
