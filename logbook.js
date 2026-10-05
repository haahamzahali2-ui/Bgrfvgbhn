// ═══════════════════════════════════
// DAILY LOG — one place to log a set AND everything you missed:
// passage links, score, time, and per-question cards (question, your answer,
// correct answer, what went wrong, concept, takeaway). Autosaves a draft.
// ═══════════════════════════════════

const LOG_DRAFT_KEY = 'mcat_log_draft';
let logState = { ready: false, sessionId: null, removed: [], mode: 'passage' };
let logDraftTimer = null;

// ═══════════════════════════════════
// LINKS — only http(s) links are ever rendered as clickable
// ═══════════════════════════════════
function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
}

function safeUrl(u) {
  try {
    const x = new URL(normalizeUrl(u));
    return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '';
  } catch(e) { return ''; }
}

function linkLabel(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e) { return 'link'; }
}

function linkChipHtml(u, label) {
  const href = safeUrl(u);
  if (!href) return '';
  return `<a class="link-chip" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="${escapeHtml(href)}">🔗 ${escapeHtml(label || linkLabel(href))}</a>`;
}

function getSessionLinks(s) { return (s && Array.isArray(s.links)) ? s.links.filter(Boolean) : []; }

// ═══════════════════════════════════
// OPEN THE EDITOR
// opts: { sessionId } to edit · { prefill: {section,total,minutes} } for new · focusMistakes
// ═══════════════════════════════════
function openLogEditor(opts = {}) {
  const s = opts.sessionId ? db.sessions.find(x => x.id === opts.sessionId) : null;
  logState = { ready: true, sessionId: s ? s.id : null, removed: [], mode: s ? 'passage' : (opts.mode || 'passage') };
  if (s) {
    fillLogForm(entryFromSession(s));
  } else {
    const last = [...db.sessions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    const p = opts.prefill || {};
    fillLogForm({
      mode: logState.mode, date: p.date || todayISO(), section: p.section || last?.section || 'cp', subject: p.subject || '',
      provider: p.provider || last?.provider || '', topic: p.topic || '', links: [''], total: p.total || '', correct: '',
      minutes: p.minutes || '', notes: '', items: []
    });
  }
  renderLogChrome();
  showPage('log');
  if (opts.focusMistakes) {
    syncMissCards();
    setTimeout(() => document.getElementById('logItemsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } else if (!s) {
    setTimeout(() => document.getElementById(document.getElementById('log-subject').value ? 'log-topic' : 'log-subject')?.focus(), 80);
  }
}

// "Log a mistake" anywhere in the app opens the same editor in single-mistake mode
function openAddMistakeModal(prefill = {}) {
  openLogEditor({ mode: 'mistake', prefill: { ...prefill, topic: prefill.flName || prefill.topic || '' } });
}

// Switch between logging a whole passage and logging just one mistake
function setLogMode(mode, fromFill) {
  if (logState.sessionId) mode = 'passage';
  logState.mode = mode;
  const page = document.getElementById('page-log');
  page.classList.toggle('mode-mistake', mode === 'mistake');
  document.querySelectorAll('#logModeToggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('logStep2Title').textContent = mode === 'mistake' ? 'The question you missed' : 'Questions you missed';

  if (mode === 'mistake' && !document.querySelector('#logItems .qcard')) addQcard();
  updateLogSummary();
  if (!fromFill) scheduleDraftSave();
}

// Navigating to the Log tab directly starts a fresh entry
function ensureLogEditor() {
  if (!logState.ready) openLogEditorSilently();
}

function openLogEditorSilently() {
  const last = [...db.sessions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  logState = { ready: true, sessionId: null, removed: [], mode: 'passage' };
  fillLogForm({ mode: 'passage', date: todayISO(), section: last?.section || 'cp', subject: '', provider: last?.provider || '', topic: '', links: [''], total: '', correct: '', minutes: '', notes: '', items: [] });
  renderLogChrome();
}

function entryFromSession(s) {
  const ms = getMistakesForSession(s.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return {
    date: s.date, section: s.section, subject: s.subject, provider: s.provider, topic: s.topic || '',
    links: getSessionLinks(s).length ? getSessionLinks(s) : [''],
    total: s.total, correct: s.correct, minutes: s.minutes || '', notes: s.notes || '',
    items: ms.map(m => ({
      id: m.id, qref: m.questionRef || '', question: m.question || '', myAnswer: m.myAnswer || '', correctAnswer: m.correctAnswer || '',
      errorType: m.errorType || '', concept: m.concept || '', what: m.what || '', takeaway: m.takeaway || '', link: m.link || '', anki: !!m.anki
    }))
  };
}

// Header, draft banner, delete button — depends on new vs. edit
function renderLogChrome() {
  const editing = !!logState.sessionId;
  document.getElementById('logTitle').textContent = editing ? 'Edit passage' : 'Log a passage';
  document.getElementById('logSubtitle').textContent = editing
    ? 'Change anything, then save.'
    : 'Takes about 30 seconds — only the basics are required.';
  document.getElementById('logDeleteTrigger').style.display = editing ? 'block' : 'none';
  document.getElementById('logDeleteBar').classList.remove('show');
  document.getElementById('logSaveBtn').textContent = editing ? 'Save changes' : 'Save';

  const banner = document.getElementById('logDraftBanner');
  const draft = editing ? null : loadLogDraft();
  if (draft) {
    const when = new Date(draft.savedAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    banner.style.display = 'flex';
    banner.innerHTML = `<span>📝 Unsaved passage from <strong>${escapeHtml(when)}</strong>${draft.data.subject ? ` (${escapeHtml(draft.data.provider)} · ${escapeHtml(draft.data.subject)})` : ''}.</span>
      <span class="smi-actions"><button class="btn-save" onclick="restoreLogDraft()">Restore it</button><button class="btn-cancel" onclick="discardLogDraft()">Discard</button></span>`;
  } else {
    banner.style.display = 'none';
  }
}

// ═══════════════════════════════════
// FORM ⇄ DATA
// ═══════════════════════════════════
function fillLogForm(e) {
  document.getElementById('log-date').value = e.date || todayISO();
  document.getElementById('log-section').value = e.section || 'cp';
  document.getElementById('log-subject').value = e.subject || '';
  document.getElementById('log-provider').value = e.provider || '';
  document.getElementById('log-topic').value = e.topic || '';
  document.getElementById('log-total').value = e.total ?? '';
  document.getElementById('log-correct').value = e.correct ?? '';
  document.getElementById('log-minutes').value = e.minutes ?? '';
  document.getElementById('log-notes').value = e.notes || '';
  const linksWrap = document.getElementById('logLinks');
  linksWrap.innerHTML = '';
  (e.links && e.links.length ? e.links : ['']).forEach(u => addLogLink(u));
  const items = document.getElementById('logItems');
  items.innerHTML = '';
  (e.items || []).forEach(it => addQcard(it));
  updateLogOptions();
  renderLogChips();
  setLogMode(logState.sessionId ? 'passage' : (e.mode || 'passage'), true);
}

function readLogForm() {
  return {
    mode: logState.mode,
    date: document.getElementById('log-date').value,
    section: document.getElementById('log-section').value,
    subject: document.getElementById('log-subject').value.trim(),
    provider: document.getElementById('log-provider').value.trim(),
    topic: document.getElementById('log-topic').value.trim(),
    links: [...document.querySelectorAll('#logLinks .log-link-input')].map(i => i.value.trim()),
    total: document.getElementById('log-total').value,
    correct: document.getElementById('log-correct').value,
    minutes: document.getElementById('log-minutes').value,
    notes: document.getElementById('log-notes').value.trim(),
    items: [...document.querySelectorAll('#logItems .qcard')].map(readQcard)
  };
}

function readQcard(card) {
  const ans = kind => card.querySelector(`.answer-chips[data-kind="${kind}"] .answer-chip.active`)?.dataset.letter || '';
  return {
    id: card.dataset.mid || '',
    qref: card.querySelector('.qc-qref').value.trim(),
    question: card.querySelector('.qc-question').value.trim(),
    myAnswer: ans('mine'), correctAnswer: ans('correct'),
    errorType: card.querySelector('.qc-type').value,
    concept: card.querySelector('.qc-concept').value.trim(),
    what: card.querySelector('.qc-what').value.trim(),
    takeaway: card.querySelector('.qc-takeaway').value.trim(),
    link: card.querySelector('.qc-link').value.trim(),
    anki: card.querySelector('.qc-anki').checked
  };
}

function isQcardEmpty(it) {
  return !it.errorType && !it.qref && !it.question && !it.myAnswer && !it.correctAnswer && !it.concept && !it.what && !it.takeaway && !it.link;
}

function updateLogOptions() {
  const section = document.getElementById('log-section').value;
  const subject = document.getElementById('log-subject').value.trim();
  const used = [...new Set([...db.sessions, ...db.mistakes].map(s => s.subject).filter(Boolean))];
  fillDatalist('logSubjectOptions', [...new Set([...SUBJECTS_BY_SECTION[section], ...used])]);
  fillDatalist('logProviderOptions', [...new Set([...PROVIDERS, ...db.sessions.map(s => s.provider).filter(Boolean)])]);
  const topics = getTopicsForSubject(subject);
  fillDatalist('logConceptOptions', [...new Set([...topics, ...db.mistakes.filter(m => m.subject === subject).map(m => m.concept).filter(Boolean), ...(topics.length ? [] : getAllTopics())])]);
}

// ═══════════════════════════════════
// LINK ROWS
// ═══════════════════════════════════
function addLogLink(value = '') {
  const wrap = document.getElementById('logLinks');
  const row = document.createElement('div');
  row.className = 'log-link-row';
  row.innerHTML = `
    <span class="log-link-icon">🔗</span>
    <input type="url" class="log-link-input" placeholder="Paste the passage / question set link (e.g. jackwestin.com/…)" value="${escapeHtml(value)}" />
    <button type="button" class="log-link-open" title="Open link" onclick="openLogLink(this)">↗</button>
    <button type="button" class="ql-remove" title="Remove link" onclick="removeLogLink(this)">✕</button>`;
  wrap.appendChild(row);
  return row.querySelector('input');
}

function openLogLink(btn) {
  const href = safeUrl(btn.parentElement.querySelector('input').value);
  if (href) window.open(href, '_blank', 'noopener');
  else showToast('Paste a valid http(s) link first');
}

function removeLogLink(btn) {
  const wrap = document.getElementById('logLinks');
  if (wrap.children.length === 1) btn.parentElement.querySelector('input').value = '';
  else btn.parentElement.remove();
  onLogInput();
}

// ═══════════════════════════════════
// QUESTION CARDS
// ═══════════════════════════════════
// The error types shown up front; the rest sit behind "More…"
const QUICK_ERRORS = ['content', 'recall', 'misread_q', 'careless', 'data', 'distractor', 'narrowed', 'timing'];

function addQcard(it = {}, guess = false) {
  const wrap = document.getElementById('logItems');
  const card = document.createElement('div');
  card.className = 'qcard';
  if (it.id) card.dataset.mid = it.id;
  const type = it.errorType || (guess ? 'guess' : '');
  const chips = (kind, sel) => ['A', 'B', 'C', 'D'].map(l => `<button type="button" class="answer-chip ${kind} ${sel === l ? 'active' : ''}" data-letter="${l}">${l}</button>`).join('');
  const hasDetails = it.qref || it.question || it.concept || it.what || it.takeaway || it.link || it.anki;
  card.innerHTML = `
    <div class="qcard-head">
      <span class="qcard-num"></span>
      <div class="qq-answers">
        <div><label>You picked</label><div class="answer-chips" data-kind="mine">${chips('mine', it.myAnswer)}</div></div>
        <span class="qq-arrow">→</span>
        <div><label>Correct</label><div class="answer-chips" data-kind="correct">${chips('correct', it.correctAnswer)}</div></div>
      </div>
      <button type="button" class="ql-remove" title="Remove">✕</button>
    </div>
    <div class="qq-label">What went wrong?</div>
    <div class="err-chips">
      ${ERROR_TYPES.map(e => `<button type="button" class="err-chip ${QUICK_ERRORS.includes(e.key) ? '' : 'extra'} ${e.key === type ? 'active' : ''}" data-type="${e.key}" style="--bucket-color:${getBucket(e.bucket).color}">${e.icon} ${escapeHtml(e.label)}</button>`).join('')}
      <button type="button" class="err-more">More…</button>
    </div>
    <input type="hidden" class="qc-type" value="${type}" />
    <div class="qc-tip"></div>
    <button type="button" class="link-btn qc-details-btn">${hasDetails ? '− details' : '+ details'} <small>question, concept, takeaway, link</small></button>
    <div class="qcard-details" style="${hasDetails ? '' : 'display:none'}">
      <div class="form-row-pair">
        <div class="form-row"><label>Concept</label><input class="qc-concept" list="logConceptOptions" placeholder="e.g. Enzyme kinetics" value="${escapeHtml(it.concept || '')}" /></div>
        <div class="form-row"><label>Question #</label><input class="qc-qref" placeholder="e.g. Q3" value="${escapeHtml(it.qref || '')}" /></div>
      </div>
      <div class="form-row"><label>The question</label><textarea class="qc-question" placeholder="Paste or paraphrase it">${escapeHtml(it.question || '')}</textarea></div>
      <div class="form-row-pair">
        <div class="form-row"><label>What happened</label><textarea class="qc-what" placeholder="Your reasoning">${escapeHtml(it.what || '')}</textarea></div>
        <div class="form-row"><label>Takeaway</label><textarea class="qc-takeaway" placeholder="The rule for next time">${escapeHtml(it.takeaway || '')}</textarea></div>
      </div>
      <div class="form-row"><label>Question link</label><input type="url" class="qc-link" placeholder="Link to this exact question" value="${escapeHtml(it.link || '')}" /></div>
      <label class="toggle-row"><input type="checkbox" class="qc-anki" ${it.anki ? 'checked' : ''} /> <span>🃏 Flag for Anki</span></label>
    </div>`;
  wrap.appendChild(card);
  refreshQcard(card);
  renumberQcards();
  return card;
}

function refreshQcard(card) {
  const type = card.querySelector('.qc-type').value;
  const et = type ? getErrorType(type) : null;
  card.style.setProperty('--bucket-color', et ? getBucket(et.bucket).color : 'var(--border)');
  card.classList.toggle('has-type', !!et);
  card.classList.toggle('guess', type === 'guess');
  card.querySelectorAll('.err-chip').forEach(c => c.classList.toggle('active', c.dataset.type === type));
  const tip = card.querySelector('.qc-tip');
  tip.innerHTML = et ? `💡 ${escapeHtml(et.tip)}` : '';
  tip.style.display = et ? 'block' : 'none';
  card.classList.remove('invalid');
}

function renumberQcards() {
  let n = 0;
  document.querySelectorAll('#logItems .qcard').forEach(c => {
    c.querySelector('.qcard-num').textContent = c.classList.contains('guess') ? '🍀' : `#${++n}`;
  });
}

// Make sure there's a card for every miss (never deletes cards you've filled in)
function syncMissCards() {
  if (logState.mode === 'mistake') return;
  const total = parseInt(document.getElementById('log-total').value, 10);
  const correct = parseInt(document.getElementById('log-correct').value, 10);
  if (!total || isNaN(correct) || correct > total) return;
  const missed = Math.min(40, total - correct);
  const misses = [...document.querySelectorAll('#logItems .qcard')].filter(c => !c.classList.contains('guess')).length;
  for (let i = misses; i < missed; i++) addQcard();
  updateLogSummary();
}

function addMissCard(guess) {
  const card = addQcard({}, guess);
  card.querySelector(guess ? '.qc-qref' : '.qc-question').focus();
  onLogInput();
}

function setAllQcards(open) {
  document.querySelectorAll('#logItems .qcard').forEach(c => c.classList.toggle('open', open));
}

// One delegated handler for every card interaction
document.addEventListener('click', e => {
  const card = e.target.closest('#logItems .qcard');
  if (!card) return;
  const t = e.target.closest('button');
  if (!t) return;
  if (t.classList.contains('answer-chip')) {
    const was = t.classList.contains('active');
    t.parentElement.querySelectorAll('.answer-chip').forEach(b => b.classList.remove('active'));
    if (!was) t.classList.add('active');
    onLogInput({ target: card });
  } else if (t.classList.contains('err-chip')) {
    const input = card.querySelector('.qc-type');
    input.value = input.value === t.dataset.type ? '' : t.dataset.type;
    refreshQcard(card); renumberQcards(); onLogInput({ target: card });
  } else if (t.classList.contains('err-more')) {
    card.classList.toggle('show-all');
    t.textContent = card.classList.contains('show-all') ? 'Less' : 'More…';
  } else if (t.classList.contains('qc-details-btn')) {
    const d = card.querySelector('.qcard-details');
    const open = d.style.display === 'none';
    d.style.display = open ? '' : 'none';
    t.firstChild.textContent = open ? '− details ' : '+ details ';
    if (open) d.querySelector('input, textarea').focus();
  } else if (t.classList.contains('ql-remove')) {
    if (card.dataset.mid) logState.removed.push(card.dataset.mid);
    card.remove(); renumberQcards(); onLogInput();
  }
});

// Section and provider pickers
function renderLogChips() {
  const sec = document.getElementById('log-section').value;
  document.getElementById('logSectionChips').innerHTML = SECTIONS.map(x =>
    `<button type="button" class="pick-chip ${x.key === sec ? 'active' : ''}" style="--sec-color:${x.color}" onclick="pickLogSection('${x.key}')">${x.short}</button>`).join('');
  const prov = document.getElementById('log-provider').value.trim();
  const counts = countBy(db.sessions.filter(s => s.provider), s => s.provider);
  const top = [...new Set([...Object.keys(counts).sort((a, b) => counts[b] - counts[a]), 'AAMC', 'UWorld', 'Jack Westin', 'Khan Academy', 'Blueprint', 'Kaplan'])].slice(0, 6);
  if (prov && !top.includes(prov)) top.push(prov);
  document.getElementById('logProviderChips').innerHTML = top.map(p =>
    `<button type="button" class="pick-chip ${p === prov ? 'active' : ''}" onclick="pickLogProvider(${jsArg(p)})">${escapeHtml(p)}</button>`).join('');
}

function pickLogSection(key) {
  const sel = document.getElementById('log-section');
  sel.value = key;
  onLogInput({ target: sel });
}

function pickLogProvider(p) {
  const input = document.getElementById('log-provider');
  input.value = p;
  onLogInput({ target: input });
}

document.addEventListener('input', e => { if (e.target.closest('#page-log')) onLogInput(e); });
document.addEventListener('change', e => { if (e.target.closest('#page-log')) onLogInput(e); });

function onLogInput(e) {
  const t = e?.target;
  if (t) {
    const card = t.closest('.qcard');
    if (card && t !== card) { refreshQcard(card); renumberQcards(); }
    if (t.id === 'log-section' || t.id === 'log-provider') renderLogChips();
    if (t.id === 'log-total' || t.id === 'log-correct') syncMissCards();
    if (t.id === 'log-section' || t.id === 'log-subject') updateLogOptions();
    if (t.id === 'log-section' && t.value === 'cars' && !document.getElementById('log-subject').value) {
      document.getElementById('log-subject').value = 'CARS — Mixed';
    }
  }
  updateLogSummary();
  scheduleDraftSave();
}

// ═══════════════════════════════════
// LIVE SUMMARY (sticky sidebar)
// ═══════════════════════════════════
function updateLogSummary() {
  const el = document.getElementById('logSummary');
  if (!el) return;
  const f = readLogForm();
  if (logState.mode === 'mistake') {
    const items = f.items.filter(it => !isQcardEmpty(it));
    const typed = items.filter(it => it.errorType);
    const issues = [];
    if (!f.subject) issues.push('Add a subject');
    if (!typed.length) issues.push('Pick "what went wrong" on the question');
    if (items.length > typed.length) issues.push(`${plural(items.length - typed.length, 'question')} still need${items.length - typed.length === 1 ? 's' : ''} "what went wrong"`);
    el.innerHTML = `
      <div class="ls-score mistake">❌</div>
      <div class="ls-sub">${typed.length ? plural(typed.length, 'mistake') + ' ready' : 'Single mistake'}</div>
      <div class="ls-rows">
        <div class="ls-row"><span>Questions</span><b>${items.length}</b></div>
        <div class="ls-row"><span>With answers</span><b>${items.filter(it => it.myAnswer && it.correctAnswer).length}</b></div>
        <div class="ls-row"><span>Links</span><b>${f.links.filter(u => safeUrl(u)).length + items.filter(it => safeUrl(it.link)).length}</b></div>
      </div>
      ${typed.map(it => { const et = getErrorType(it.errorType); return `<div class="ls-types"><span class="error-chip" style="--bucket-color:${getBucket(et.bucket).color}">${et.icon} ${escapeHtml(et.label)}</span></div>`; }).join('')}
      ${issues.length ? `<ul class="ls-issues">${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : `<div class="ls-ready">✓ Ready to save</div>`}`;
    const cnt = document.getElementById('logMissCount');
    if (cnt) cnt.textContent = 'add more with the button below';
    return;
  }
  const total = parseInt(f.total, 10), correct = parseInt(f.correct, 10);
  const valid = total > 0 && !isNaN(correct) && correct <= total && correct >= 0;
  const acc = valid ? pct(correct, total) : null;
  const missed = valid ? total - correct : 0;
  const items = f.items.filter(it => !isQcardEmpty(it));
  const explained = items.filter(it => it.errorType && it.errorType !== 'guess').length;

  const pill = document.getElementById('logScorePill');
  if (pill) { pill.textContent = acc === null ? '' : acc + '%'; pill.className = 'score-pill ' + (acc === null ? '' : getAccuracyClass(acc)); }

  let issue = '';
  if (!f.provider) issue = 'Pick a provider';
  else if (!(total > 0) || isNaN(correct)) issue = 'Enter your score';
  else if (correct > total) issue = 'Right can\'t be more than total';
  else if (items.some(it => !it.errorType)) issue = 'Tap "what went wrong" on each question';
  else if (f.links.some(u => u && !safeUrl(u))) issue = 'That link doesn\'t look right';
  el.innerHTML = issue
    ? `<span class="qs-issue">${escapeHtml(issue)}</span>`
    : `<span class="qs-ready">✓ ${acc}% · ${missed ? `${explained}/${missed} misses explained` : 'perfect! 💯'}</span>`;
  const cnt = document.getElementById('logMissCount');
  if (cnt) cnt.textContent = valid ? (missed ? `${plural(missed, 'card')} — tap your answer, the right one, and what went wrong` : 'none — perfect! 💯') : 'cards appear once you enter your score';
}

// ═══════════════════════════════════
// DRAFT AUTOSAVE (new entries only)
// ═══════════════════════════════════
function scheduleDraftSave() {
  if (logState.sessionId) return;
  clearTimeout(logDraftTimer);
  logDraftTimer = setTimeout(() => {
    if (!logState.ready || logState.sessionId) return;
    const data = readLogForm();
    const hasContent = data.subject || data.total || data.topic || data.links.some(Boolean) || data.items.some(it => !isQcardEmpty(it));
    try {
      if (hasContent) localStorage.setItem(LOG_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), data }));
      else localStorage.removeItem(LOG_DRAFT_KEY);
    } catch(e) {}
  }, 400);
}

function loadLogDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(LOG_DRAFT_KEY));
    return d && d.data ? d : null;
  } catch(e) { return null; }
}

function restoreLogDraft() {
  const d = loadLogDraft();
  if (!d) return;
  logState.mode = d.data.mode || 'passage';
  fillLogForm(d.data);
  document.getElementById('logDraftBanner').style.display = 'none';
  showToast('Draft restored ✓');
}

function discardLogDraft() {
  clearTimeout(logDraftTimer);
  try { localStorage.removeItem(LOG_DRAFT_KEY); } catch(e) {}
  document.getElementById('logDraftBanner').style.display = 'none';
}

// ═══════════════════════════════════
// SAVE / DELETE
// ═══════════════════════════════════
function saveLogEntry() {
  if (logState.mode === 'mistake') return saveMistakeOnly();
  const f = readLogForm();
  const total = parseInt(f.total, 10), correct = parseInt(f.correct, 10);
  const minutes = f.minutes ? Math.max(0, parseFloat(f.minutes)) : 0;
  if (!f.subject) f.subject = f.section === 'cars' ? 'CARS — Mixed' : `${getSection(f.section).name} — Mixed`;
  if (!f.date) f.date = todayISO();
  if (!f.provider) { showToast('Pick a provider'); document.getElementById('log-provider').focus(); return; }
  if (!total || total < 1 || isNaN(correct) || correct < 0) { showToast('Enter your score'); document.getElementById('log-correct').focus(); return; }
  if (correct > total) { showToast('Correct can\'t be more than total questions'); return; }

  // Question cards: skip blank ones, require an error type on the rest
  const cards = [...document.querySelectorAll('#logItems .qcard')];
  const items = [];
  for (const card of cards) {
    const it = readQcard(card);
    if (isQcardEmpty(it)) continue;
    if (!it.errorType) {
      card.classList.add('open', 'invalid');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(`Pick "what went wrong" for ${card.querySelector('.qcard-num').textContent}`);
      return;
    }
    items.push(it);
  }
  const links = [...new Set(f.links.map(u => safeUrl(u)).filter(Boolean))];

  const fields = { date: f.date, section: f.section, subject: f.subject, provider: f.provider, topic: f.topic, links, total, correct, minutes, notes: f.notes };
  let sid = logState.sessionId;
  if (sid) {
    const s = db.sessions.find(x => x.id === sid);
    if (s) Object.assign(s, fields);
  } else {
    sid = newId('SET');
    db.sessions.push({ id: sid, createdAt: Date.now(), ...fields });
  }

  // Remove deleted cards, update existing ones (keeping their review history), add new ones
  db.mistakes = db.mistakes.filter(m => !logState.removed.includes(m.id));
  items.forEach((it, i) => {
    const mFields = {
      date: f.date, section: f.section, subject: f.subject, provider: f.provider, sessionId: sid,
      questionRef: it.qref, question: it.question, myAnswer: it.myAnswer, correctAnswer: it.correctAnswer,
      errorType: it.errorType, concept: it.concept, what: it.what, takeaway: it.takeaway,
      link: safeUrl(it.link), anki: it.anki
    };
    const existing = it.id && db.mistakes.find(m => m.id === it.id);
    if (existing) Object.assign(existing, mFields);
    else db.mistakes.push(normalizeMistake({ id: newId('MK'), createdAt: Date.now() + i, tags: [], ...mFields }));
  });
  // Keep set-level fields in sync on mistakes that weren't in the editor (e.g. older entries)
  db.mistakes.forEach(m => { if (m.sessionId === sid) Object.assign(m, { date: f.date, section: f.section, subject: f.subject, provider: f.provider }); });

  saveDB();
  if (!logState.sessionId) discardLogDraft();
  const wasEdit = !!logState.sessionId;
  logState.ready = false;
  const missed = total - correct;
  const loggedMiss = items.filter(it => it.errorType !== 'guess').length;
  showPage(wasEdit ? 'practice-list' : 'home');
  highlightEntry(sid);
  showToast(wasEdit ? 'Entry updated ✓'
    : `Saved ✓ ${correct}/${total} (${pct(correct, total)}%)`);
}

// Single-mistake mode: save the question cards as standalone mistakes (no score)
function saveMistakeOnly() {
  const f = readLogForm();
  if (!f.subject) { showToast('Please add a subject'); document.getElementById('log-subject').focus(); return; }
  const passageLink = f.links.map(safeUrl).find(Boolean) || '';
  const items = [];
  for (const card of document.querySelectorAll('#logItems .qcard')) {
    const it = readQcard(card);
    if (isQcardEmpty(it)) continue;
    if (!it.errorType) {
      card.classList.add('open', 'invalid');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(`Pick "what went wrong" for ${card.querySelector('.qcard-num').textContent}`);
      return;
    }
    items.push(it);
  }
  if (!items.length) { showToast('Pick "what went wrong" on the question first'); return; }
  const tags = f.topic ? [f.topic] : [];
  items.forEach((it, i) => db.mistakes.push(normalizeMistake({
    id: newId('MK'), createdAt: Date.now() + i, date: f.date || todayISO(), section: f.section, subject: f.subject,
    provider: f.provider, sessionId: null, questionRef: it.qref, question: it.question, myAnswer: it.myAnswer,
    correctAnswer: it.correctAnswer, errorType: it.errorType, concept: it.concept, what: it.what, takeaway: it.takeaway,
    link: safeUrl(it.link) || passageLink, anki: it.anki, tags
  })));
  saveDB();
  discardLogDraft();
  logState.ready = false;
  showPage('mistakes');
  showToast(`Logged ${plural(items.length, 'mistake')} ✓ — it'll show up in your review queue tomorrow`);
}

function confirmDeleteLogEntry() {
  const sid = logState.sessionId;
  if (!sid) return;
  const alsoMistakes = document.getElementById('logDeleteMistakes').checked;
  const sIdx = db.sessions.findIndex(s => s.id === sid);
  const [removedSet] = db.sessions.splice(sIdx, 1);
  const removedMistakes = alsoMistakes ? db.mistakes.filter(m => m.sessionId === sid) : [];
  if (alsoMistakes) db.mistakes = db.mistakes.filter(m => m.sessionId !== sid);
  saveDB();
  logState.ready = false;
  showPage('practice-list');
  showToast(`Entry deleted${removedMistakes.length ? ` with ${plural(removedMistakes.length, 'mistake')}` : ''}`, 'Undo', () => {
    db.sessions.splice(sIdx, 0, removedSet);
    db.mistakes.push(...removedMistakes);
    saveDB(); refreshAll(); showToast('Restored ✓');
  });
}

function cancelLogEntry() {
  clearTimeout(logDraftTimer);
  logState.ready = false;
  showPage(db.sessions.length ? 'practice-list' : 'home');
}

function highlightEntry(sid) {
  setTimeout(() => {
    const el = document.querySelector(`[data-entry="${CSS.escape(sid)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1800);
  }, 120);
}
