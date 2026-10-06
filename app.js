// ═══════════════════════════════════
// MCAT PREP — log a missed question: link, question #, why.
// Everything lives in this one file.
// ═══════════════════════════════════

const STORAGE_KEY = 'mcat_prep_data';
const OLD_DATA_KEY = 'mcat_prep_data_v2_backup';
const SYNC_URL_KEY = 'mcat_sheet_url';

const SECTIONS = { cp: 'Chem/Phys', cars: 'CARS', bb: 'Bio/Biochem', ps: 'Psych/Soc' };
const REASONS = {
  content: "Didn't know it",
  forgot: 'Forgot it',
  misread: 'Misread it',
  careless: 'Careless mistake',
  trap: 'Fell for a trap',
  time: 'Ran out of time'
};

let db = { version: 3, entries: [], exams: [], updatedAt: 0 };
let editingId = null;

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════
const $ = id => document.getElementById(id);

function esc(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  const d = new Date((iso || '') + 'T00:00:00');
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function newId() { return `E-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

// Only http(s) links are ever made clickable
function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const x = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s);
    return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '';
  } catch (e) { return ''; }
}

function linkLabel(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'link'; }
}

function toast(msg, undoFn) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (undoFn) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.onclick = () => { t.classList.remove('show'); undoFn(); };
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), undoFn ? 6000 : 3000);
}

// ═══════════════════════════════════
// DATA — load, save, and convert data from the old version of the app
// ═══════════════════════════════════
const OLD_REASON = {
  content: 'content', recall: 'forgot', misread_q: 'misread', misread_p: 'misread', data: 'misread',
  math: 'careless', careless: 'careless', distractor: 'trap', narrowed: 'trap', changed: 'trap',
  scope: 'trap', reasoning: 'trap', research: 'trap', timing: 'time'
};

function migrate(d) {
  if (!d || typeof d !== 'object') return { version: 3, entries: [], exams: [], updatedAt: 0 };
  if (d.version === 3) {
    d.entries = Array.isArray(d.entries) ? d.entries : [];
    d.exams = Array.isArray(d.exams) ? d.exams : [];
    return d;
  }
  const sessions = new Map((d.sessions || []).map(s => [s.id, s]));
  const mistakes = (d.mistakes || []).filter(m => m.errorType !== 'guess');
  const entries = mistakes.map(m => {
    const s = sessions.get(m.sessionId);
    return {
      id: m.id, date: m.date || s?.date || '', link: m.link || (s?.links || [])[0] || '',
      section: m.section || s?.section || '', qnum: (String(m.questionRef || '').match(/\d+/) || [''])[0],
      reason: OLD_REASON[m.errorType] || 'content', correct: s ? s.correct : '', total: s ? s.total : '',
      passage: m.sessionId || ''
    };
  });
  // Passages you logged with no misses keep their score
  (d.sessions || []).forEach(s => {
    if (!mistakes.some(m => m.sessionId === s.id)) {
      entries.push({ id: s.id, date: s.date, link: (s.links || [])[0] || '', section: s.section, qnum: '', reason: '', correct: s.correct, total: s.total, passage: s.id });
    }
  });
  const exams = (d.fullLengths || []).map(f => ({ id: f.id, date: f.date, name: f.name || f.provider || '', cp: f.cp, cars: f.cars, bb: f.bb, ps: f.ps }));
  return { version: 3, entries, exams, updatedAt: d.updatedAt || 0 };
}

function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
  if (raw && raw.version !== 3 && (raw.sessions || raw.mistakes)) {
    try { localStorage.setItem(OLD_DATA_KEY, JSON.stringify(raw)); } catch (e) {} // keep the old data, just in case
  }
  db = migrate(raw);
  save(false);
}

// touch = a real change: timestamp it and send it to the Google Sheet
function save(touch = true) {
  if (touch) db.updatedAt = Date.now();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save — your browser storage is full or blocked.'); }
  if (touch) queueSync();
}

// Entries from the same passage (same link + day) share one score
function passageKey(e) { return e.passage || (e.link ? `${e.link}|${e.date}` : e.id); }

function scoreTotals(entries) {
  const seen = new Set();
  let correct = 0, total = 0;
  entries.forEach(e => {
    const k = passageKey(e);
    if (seen.has(k) || !(Number(e.total) > 0)) return;
    seen.add(k);
    correct += Number(e.correct) || 0;
    total += Number(e.total) || 0;
  });
  return { correct, total, accuracy: pct(correct, total) };
}

const isMiss = e => !!(e.qnum || e.reason);

// ═══════════════════════════════════
// PAGES
// ═══════════════════════════════════
function show(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  ({ log: renderLog, history: renderHistory, stats: renderStats, exams: renderExams })[page]();
  window.scrollTo({ top: 0 });
}

// ═══════════════════════════════════
// LOG
// ═══════════════════════════════════
function fillSelects() {
  $('f-section').innerHTML = '<option value="">Section…</option>' + Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('f-reason').innerHTML = '<option value="">Why did you miss it?</option>' + Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
}

function renderLog() {
  const todays = db.entries.filter(e => e.date === today()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('todayList').innerHTML = todays.length
    ? `<h3>Today</h3>${todays.map(entryRow).join('')}`
    : '';
}

function saveEntry() {
  const link = $('f-link').value.trim();
  const section = $('f-section').value;
  const qnum = $('f-qnum').value.trim();
  const reason = $('f-reason').value;
  const correct = $('f-correct').value.trim();
  const total = $('f-total').value.trim();
  const msg = $('formMsg');

  if (link && !safeUrl(link)) return formError("That link doesn't look right.", 'f-link');
  if (qnum && !reason) return formError('Pick why you missed it.', 'f-reason');
  if (reason && !qnum) return formError('Which question number?', 'f-qnum');
  if ((correct && !total) || (total && !correct)) return formError('Fill in both parts of the score (e.g. 4 out of 6).', correct ? 'f-total' : 'f-correct');
  if (total && (Number(correct) > Number(total) || Number(total) < 1)) return formError("Score doesn't add up.", 'f-correct');
  if (!qnum && !total) return formError('Add a question number, or a score if you got them all right.', 'f-qnum');

  const data = { link: safeUrl(link), section, qnum, reason, correct: correct ? Number(correct) : '', total: total ? Number(total) : '' };
  if (editingId) {
    const e = db.entries.find(x => x.id === editingId);
    if (e) Object.assign(e, data);
    save();
    cancelEdit();
    toast('Updated ✓');
    show('history');
    return;
  }
  db.entries.push({ id: newId(), createdAt: Date.now(), date: today(), ...data });
  save();
  msg.className = 'form-msg ok';
  msg.innerHTML = qnum
    ? `Saved Q${esc(qnum)} ✓ The passage is still filled in, so just enter the next question #. <button type="button" class="text-btn" onclick="newPassage()">Start a new passage</button>`
    : 'Saved ✓';
  // Keep link / section / score so the next miss from this passage is quick
  $('f-qnum').value = '';
  $('f-reason').value = '';
  if (!qnum) newPassage(true);
  $('f-qnum').focus();
  renderLog();
}

function formError(text, focusId) {
  const msg = $('formMsg');
  msg.className = 'form-msg error';
  msg.textContent = text;
  if (focusId) $(focusId).focus();
}

function newPassage(keepMsg) {
  ['f-link', 'f-qnum', 'f-reason', 'f-correct', 'f-total'].forEach(id => { $(id).value = ''; });
  if (!keepMsg) $('formMsg').className = 'form-msg';
  $('f-link').focus();
}

function openLink() {
  const u = safeUrl($('f-link').value);
  if (u) window.open(u, '_blank', 'noopener');
}

function editEntry(id) {
  const e = db.entries.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  $('f-link').value = e.link || '';
  $('f-section').value = e.section || '';
  $('f-qnum').value = e.qnum || '';
  $('f-reason').value = e.reason || '';
  $('f-correct').value = e.correct ?? '';
  $('f-total').value = e.total ?? '';
  $('logTitle').textContent = 'Edit entry';
  $('saveBtn').textContent = 'Update';
  $('cancelEditBtn').style.display = 'inline-block';
  $('formMsg').className = 'form-msg';
  show('log');
}

function cancelEdit() {
  editingId = null;
  $('logTitle').textContent = 'Log a missed question';
  $('saveBtn').textContent = 'Save';
  $('cancelEditBtn').style.display = 'none';
  newPassage();
}

function deleteEntry(id) {
  const i = db.entries.findIndex(e => e.id === id);
  if (i < 0) return;
  const [removed] = db.entries.splice(i, 1);
  save();
  rerender();
  toast('Deleted', () => { db.entries.splice(i, 0, removed); save(); rerender(); });
}

function rerender() {
  const active = document.querySelector('.page.active')?.id.replace('page-', '') || 'log';
  ({ log: renderLog, history: renderHistory, stats: renderStats, exams: renderExams })[active]();
}

// ═══════════════════════════════════
// HISTORY
// ═══════════════════════════════════
function entryRow(e) {
  const url = safeUrl(e.link);
  return `<div class="entry">
    <span class="e-date">${fmtDate(e.date)}</span>
    <span class="e-sec">${esc(SECTIONS[e.section] || '')}</span>
    <span class="e-q">${e.qnum ? 'Q' + esc(e.qnum) : '—'}</span>
    <span class="e-why">${e.reason ? esc(REASONS[e.reason]) : (e.total ? 'No misses' : '')}</span>
    <span class="e-score">${e.total ? `${esc(e.correct)}/${esc(e.total)}` : ''}</span>
    <span class="e-link">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel(url))} ↗</a>` : ''}</span>
    <span class="e-actions">
      <button class="icon-btn" title="Edit" onclick="editEntry('${esc(e.id)}')">✎</button>
      <button class="icon-btn" title="Delete" onclick="deleteEntry('${esc(e.id)}')">✕</button>
    </span>
  </div>`;
}

function renderHistory() {
  const q = ($('historySearch').value || '').trim().toLowerCase();
  const list = [...db.entries]
    .filter(e => !q || [e.link, SECTIONS[e.section], REASONS[e.reason], e.qnum && 'q' + e.qnum, e.date].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  $('historyList').innerHTML = list.length
    ? list.map(entryRow).join('')
    : `<div class="empty">${db.entries.length ? 'Nothing matches that search.' : 'Nothing logged yet. Go to <b>Log</b> to add your first missed question.'}</div>`;
}

// ═══════════════════════════════════
// STATS
// ═══════════════════════════════════
function renderStats() {
  const misses = db.entries.filter(isMiss);
  const score = scoreTotals(db.entries);
  const counts = {};
  misses.forEach(e => { if (e.reason) counts[e.reason] = (counts[e.reason] || 0) + 1; });
  const ranked = Object.keys(REASONS).filter(k => counts[k]).sort((a, b) => counts[b] - counts[a]);
  const top = ranked[0];

  if (!misses.length && !score.total) {
    $('statsBody').innerHTML = '<div class="empty">Log a few questions and your stats show up here.</div>';
    return;
  }
  const max = counts[top] || 1;
  $('statsBody').innerHTML = `
    ${top ? `<div class="headline">You miss questions most because:<b>${esc(REASONS[top])}</b><span>${counts[top]} of ${misses.length} misses (${pct(counts[top], misses.length)}%)</span></div>` : ''}
    <div class="stat-tiles">
      <div><b>${misses.length}</b><span>missed questions logged</span></div>
      <div><b>${score.total ? score.accuracy + '%' : '—'}</b><span>accuracy${score.total ? ` (${score.correct}/${score.total})` : ''}</span></div>
      <div><b>${new Set(db.entries.map(passageKey)).size}</b><span>passages</span></div>
    </div>
    <h3>Why you miss</h3>
    <div class="bars">${ranked.map(k => `<div class="bar-row"><span>${esc(REASONS[k])}</span><div class="bar"><i style="width:${(counts[k] / max) * 100}%"></i></div><b>${counts[k]}</b></div>`).join('')}</div>
    <h3>By section</h3>
    <div class="bars">${Object.entries(SECTIONS).map(([k, name]) => {
      const es = db.entries.filter(e => e.section === k);
      if (!es.length) return '';
      const sc = scoreTotals(es);
      const sm = es.filter(isMiss).length;
      const c = {};
      es.filter(e => e.reason).forEach(e => { c[e.reason] = (c[e.reason] || 0) + 1; });
      const t = Object.keys(REASONS).filter(k => c[k]).sort((a, b) => c[b] - c[a])[0];
      return `<div class="sec-row"><b>${name}</b><span>${sm} miss${sm === 1 ? '' : 'es'}${sc.total ? ` · ${sc.accuracy}% correct` : ''}${t ? ` · mostly “${esc(REASONS[t])}”` : ''}</span></div>`;
    }).join('') || '<div class="empty small">Pick a section when you log to see this.</div>'}</div>`;
}

// ═══════════════════════════════════
// EXAMS
// ═══════════════════════════════════
const examTotal = x => Number(x.cp) + Number(x.cars) + Number(x.bb) + Number(x.ps);

function renderExams() {
  const list = [...db.exams].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totals = list.map(examTotal);
  $('examSummary').innerHTML = list.length
    ? `<div class="stat-tiles"><div><b>${totals[0]}</b><span>latest</span></div><div><b>${Math.max(...totals)}</b><span>best</span></div><div><b>${Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)}</b><span>average</span></div></div>`
    : '';
  $('examList').innerHTML = list.length
    ? `<div class="exam-row head"><span>Date</span><span>Exam</span><span>C/P</span><span>CARS</span><span>B/B</span><span>P/S</span><span>Total</span><span></span></div>` +
      list.map(x => `<div class="exam-row"><span>${fmtDate(x.date)}</span><span>${esc(x.name) || '—'}</span><span>${esc(x.cp)}</span><span>${esc(x.cars)}</span><span>${esc(x.bb)}</span><span>${esc(x.ps)}</span><b>${examTotal(x)}</b><span><button class="icon-btn" title="Delete" onclick="deleteExam('${esc(x.id)}')">✕</button></span></div>`).join('')
    : '<div class="empty">No exams yet. Add your first full-length above.</div>';
}

function saveExam() {
  const v = id => $(id).value.trim();
  const scores = ['x-cp', 'x-cars', 'x-bb', 'x-ps'].map(id => Number(v(id)));
  if (scores.some(n => !(n >= 118 && n <= 132))) { toast('Each section score is between 118 and 132.'); return; }
  db.exams.push({ id: newId(), date: v('x-date') || today(), name: v('x-name'), cp: scores[0], cars: scores[1], bb: scores[2], ps: scores[3] });
  save();
  ['x-name', 'x-cp', 'x-cars', 'x-bb', 'x-ps'].forEach(id => { $(id).value = ''; });
  toast(`Saved — ${scores.reduce((a, b) => a + b, 0)} ✓`);
  renderExams();
}

function deleteExam(id) {
  const i = db.exams.findIndex(x => x.id === id);
  if (i < 0) return;
  const [removed] = db.exams.splice(i, 1);
  save();
  renderExams();
  toast('Exam deleted', () => { db.exams.splice(i, 0, removed); save(); renderExams(); });
}

// ═══════════════════════════════════
// SETTINGS — backup files
// ═══════════════════════════════════
function openSettings() {
  $('sheetUrl').value = getSyncUrl();
  $('syncConnected').style.display = getSyncUrl() ? 'inline' : 'none';
  $('settings').classList.add('open');
}
function closeSettings() { $('settings').classList.remove('open'); }

function downloadBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `mcat-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Backup downloaded ✓');
}

function restoreBackup(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = migrate(JSON.parse(r.result));
      if (!Array.isArray(data.entries)) throw new Error();
      db = data;
      save();
      rerender();
      toast(`Restored ${db.entries.length} entries ✓`);
    } catch (e) { toast("That file isn't a backup from this app."); }
    input.value = '';
  };
  r.readAsText(file);
}

// ═══════════════════════════════════
// GOOGLE SHEET SYNC — every save also goes to your own Google Sheet.
// Pulls on open and when you come back to the tab; newest copy wins.
// ═══════════════════════════════════
let syncTimer = null, syncBusy = false, syncAgain = false;

function getSyncUrl() { try { return localStorage.getItem(SYNC_URL_KEY) || ''; } catch (e) { return ''; } }

function syncStatus(state, detail = '') {
  const labels = { off: 'Not connected', busy: 'Syncing…', ok: 'Synced ✓', error: `Couldn't sync${detail ? ' — ' + detail : ''}` };
  $('syncDot').className = 'sync-dot ' + state;
  $('syncDot').title = 'Google Sheet: ' + labels[state];
  $('syncStatus').textContent = labels[state];
  $('syncStatus').className = 'sync-status ' + state;
}

function queueSync() {
  if (!getSyncUrl()) return;
  syncStatus('busy');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushSync, 1500);
}

function sheetTables() {
  const rows = [...db.entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {
    Entries: [['Date', 'Section', 'Link', 'Question #', 'Why', 'Correct', 'Total']]
      .concat(rows.map(e => [e.date, SECTIONS[e.section] || '', e.link || '', e.qnum || '', REASONS[e.reason] || '', e.correct ?? '', e.total ?? ''])),
    Exams: [['Date', 'Exam', 'C/P', 'CARS', 'B/B', 'P/S', 'Total']]
      .concat([...db.exams].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(x => [x.date, x.name || '', x.cp, x.cars, x.bb, x.ps, examTotal(x)]))
  };
}

async function pushSync() {
  syncTimer = null;
  const url = getSyncUrl();
  if (!url) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  syncStatus('busy');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // a "simple" request, so no CORS preflight
      body: JSON.stringify({ action: 'save', updatedAt: db.updatedAt || Date.now(), data: JSON.stringify(db), tables: sheetTables() })
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'the sheet said no');
    syncStatus('ok');
  } catch (e) {
    syncStatus('error', e.message === 'Failed to fetch' ? 'no connection' : e.message);
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; pushSync(); }
  }
}

async function pullSync(announce = false) {
  const url = getSyncUrl();
  if (!url) { syncStatus('off'); return; }
  syncStatus('busy');
  try {
    const out = await (await fetch(url)).json();
    if (!out.ok) throw new Error(out.error || 'the sheet said no');
    const remoteAt = Number(out.updatedAt) || 0;
    const localAt = Number(db.updatedAt) || 0;
    if (out.data && remoteAt > localAt) {
      db = migrate(JSON.parse(out.data));
      db.updatedAt = remoteAt;
      save(false);
      rerender();
      syncStatus('ok');
      if (announce) toast('☁️ Loaded your data from Google Sheets');
    } else if (!out.data || localAt > remoteAt) {
      syncStatus('ok');
      await pushSync();
      if (announce) toast('☁️ Connected — your data now saves to Google Sheets');
    } else {
      syncStatus('ok');
      if (announce) toast('☁️ Everything is in sync');
    }
  } catch (e) {
    syncStatus('error', e.message === 'Failed to fetch' ? 'no connection' : e.message);
    if (announce) toast("Couldn't reach the sheet — check the URL and that access is set to “Anyone”.");
  }
}

function connectSheet() {
  const url = $('sheetUrl').value.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
    toast('That URL should start with https://script.google.com/macros/s/ and end in /exec');
    return;
  }
  try { localStorage.setItem(SYNC_URL_KEY, url); } catch (e) {}
  $('syncConnected').style.display = 'inline';
  pullSync(true);
}

function disconnectSheet() {
  try { localStorage.removeItem(SYNC_URL_KEY); } catch (e) {}
  $('sheetUrl').value = '';
  $('syncConnected').style.display = 'none';
  syncStatus('off');
  toast('Disconnected. Your data stays here and in the sheet.');
}

function copyScript(btn) {
  const text = $('scriptText').value;
  const done = () => { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = 'Copy the script'; }, 2000); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => { $('scriptText').style.display = 'block'; $('scriptText').select(); });
  else { $('scriptText').style.display = 'block'; $('scriptText').select(); try { document.execCommand('copy'); done(); } catch (e) {} }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && getSyncUrl() && !syncTimer && !syncBusy) pullSync();
});

// ═══════════════════════════════════
// START
// ═══════════════════════════════════
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });
$('settings').addEventListener('mousedown', e => { if (e.target.id === 'settings') closeSettings(); });
$('logForm').addEventListener('submit', e => { e.preventDefault(); saveEntry(); });
$('examForm').addEventListener('submit', e => { e.preventDefault(); saveExam(); });
fillSelects();
$('x-date').value = today();
load();
show('log');
if (getSyncUrl()) pullSync(); else syncStatus('off');
