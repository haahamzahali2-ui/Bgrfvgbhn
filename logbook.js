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
  if (!logState.sessionId) document.getElementById('logSaveBtn').textContent = mode === 'mistake' ? 'Save Mistake' : 'Save Entry';
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
  document.getElementById('logTitle').textContent = editing ? 'Edit Passage' : 'Log a Passage';
  document.getElementById('logSubtitle').textContent = editing
    ? 'Update the passage or any of its questions — review history is kept'
    : 'Pick what you want to log below — everything lives in one place';
  document.getElementById('logDeleteTrigger').style.display = editing ? 'block' : 'none';
  document.getElementById('logModeToggle').style.display = editing ? 'none' : 'grid';
  document.getElementById('logDeleteBar').classList.remove('show');
  document.getElementById('logSaveBtn').textContent = editing ? 'Save Changes' : logState.mode === 'mistake' ? 'Save Mistake' : 'Save Entry';

  const banner = document.getElementById('logDraftBanner');
  const draft = editing ? null : loadLogDraft();
  if (draft) {
    const when = new Date(draft.savedAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    banner.style.display = 'flex';
    banner.innerHTML = `<span>📝 You have an unsaved entry from <strong>${escapeHtml(when)}</strong>${draft.data.subject ? ` (${escapeHtml(draft.data.provider)} · ${escapeHtml(draft.data.subject)})` : ''}.</span>
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
function addQcard(it = {}, guess = false) {
  const wrap = document.getElementById('logItems');
  const card = document.createElement('div');
  card.className = 'qcard open';
  if (it.id) card.dataset.mid = it.id;
  const type = it.errorType || (guess ? 'guess' : '');
  const chips = (kind, sel) => ['A', 'B', 'C', 'D'].map(l => `<button type="button" class="answer-chip ${kind} ${sel === l ? 'active' : ''}" data-letter="${l}">${l}</button>`).join('');
  card.innerHTML = `
    <div class="qcard-head">
      <span class="qcard-num"></span>
      <input class="qc-qref" placeholder="Q#" value="${escapeHtml(it.qref || '')}" />
      <span class="qcard-summary"></span>
      <button type="button" class="qcard-toggle" title="Collapse / expand">⌄</button>
      <button type="button" class="ql-remove" title="Remove this question">✕</button>
    </div>
    <div class="qcard-body">
      <div class="form-row"><label>The question <span class="label-opt">(paste or paraphrase — becomes your review flashcard)</span></label>
        <textarea class="qc-question" placeholder="e.g. Which change would increase Km without changing Vmax?">${escapeHtml(it.question || '')}</textarea></div>
      <div class="qcard-answers">
        <div class="form-row"><label>Answer you picked</label><div class="answer-chips" data-kind="mine">${chips('mine', it.myAnswer)}</div></div>
        <div class="form-row"><label>Correct answer</label><div class="answer-chips" data-kind="correct">${chips('correct', it.correctAnswer)}</div></div>
      </div>
      <div class="form-row"><label>What went wrong?</label>
        <select class="qc-type">${errorTypeOptionsHtml(type)}</select>
        <div class="qc-tip"></div></div>
      <div class="form-row-pair">
        <div class="form-row"><label>Concept / topic</label><input class="qc-concept" list="logConceptOptions" placeholder="e.g. Enzyme inhibition & regulation" value="${escapeHtml(it.concept || '')}" /></div>
        <div class="form-row"><label>Question link <span class="label-opt">(optional)</span></label><input type="url" class="qc-link" placeholder="Link to this exact question" value="${escapeHtml(it.link || '')}" /></div>
      </div>
      <div class="form-row-pair">
        <div class="form-row"><label>What happened <span class="label-opt">(your reasoning)</span></label><textarea class="qc-what" placeholder="e.g. Thought Vmax dropped — mixed up competitive vs noncompetitive">${escapeHtml(it.what || '')}</textarea></div>
        <div class="form-row"><label>Takeaway <span class="label-opt">(the rule for next time)</span></label><textarea class="qc-takeaway" placeholder="e.g. Competitive: Km ↑, Vmax same">${escapeHtml(it.takeaway || '')}</textarea></div>
      </div>
      <label class="toggle-row"><input type="checkbox" class="qc-anki" ${it.anki ? 'checked' : ''} /> <span>🃏 Flag for Anki export</span></label>
    </div>`;
  wrap.appendChild(card);
  refreshQcard(card);
  renumberQcards();
  return card;
}

function refreshQcard(card) {
  const it = readQcard(card);
  const et = it.errorType ? getErrorType(it.errorType) : null;
  card.style.setProperty('--bucket-color', et ? getBucket(et.bucket).color : 'var(--border)');
  card.classList.toggle('has-type', !!et);
  card.classList.toggle('guess', it.errorType === 'guess');
  card.querySelector('.qc-tip').innerHTML = et ? `<strong>Fix it:</strong> ${escapeHtml(et.tip)}` : '';
  card.querySelector('.qc-tip').style.display = et ? 'block' : 'none';
  const parts = [];
  if (it.myAnswer || it.correctAnswer) parts.push(`<span class="answer-flip">${it.myAnswer || '?'} → ${it.correctAnswer || '?'}</span>`);
  if (et) parts.push(`<span class="error-chip" style="--bucket-color:${getBucket(et.bucket).color}">${et.icon} ${escapeHtml(et.label)}</span>`);
  if (it.concept) parts.push(`<span class="qcard-concept">${escapeHtml(it.concept)}</span>`);
  card.querySelector('.qcard-summary').innerHTML = parts.join('') || '<span class="muted">New question — fill in what went wrong</span>';
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
  if (e.target.classList.contains('answer-chip')) {
    const was = e.target.classList.contains('active');
    e.target.parentElement.querySelectorAll('.answer-chip').forEach(b => b.classList.remove('active'));
    if (!was) e.target.classList.add('active');
    refreshQcard(card); onLogInput();
  } else if (e.target.classList.contains('ql-remove')) {
    if (card.dataset.mid) logState.removed.push(card.dataset.mid);
    card.remove(); renumberQcards(); onLogInput();
  } else if (e.target.classList.contains('qcard-toggle') || (e.target.closest('.qcard-head') && !e.target.closest('input, button'))) {
    card.classList.toggle('open');
  }
});

document.addEventListener('input', e => { if (e.target.closest('#page-log')) onLogInput(e); });
document.addEventListener('change', e => { if (e.target.closest('#page-log')) onLogInput(e); });

function onLogInput(e) {
  const t = e?.target;
  if (t) {
    const card = t.closest('.qcard');
    if (card) { refreshQcard(card); renumberQcards(); }
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
  const total = parseInt(f.total, 10), correct = parseInt(f.correct, 10), minutes = parseFloat(f.minutes);
  const valid = total > 0 && !isNaN(correct) && correct <= total && correct >= 0;
  const acc = valid ? pct(correct, total) : null;
  const missed = valid ? total - correct : 0;
  const items = f.items.filter(it => !isQcardEmpty(it));
  const logged = items.filter(it => it.errorType && it.errorType !== 'guess').length;
  const guesses = items.filter(it => it.errorType === 'guess').length;
  const pace = valid && minutes > 0 ? Math.round(minutes * 60 / total) : null;
  const target = getTargetPace(f.section);
  const byType = countBy(items.filter(it => it.errorType), it => it.errorType);
  const cls = acc === null ? '' : getAccuracyClass(acc);

  const issues = [];
  if (!f.subject) issues.push('Add a subject');
  if (!f.provider) issues.push('Add a provider');
  if (!(total > 0)) issues.push('Enter how many questions');
  else if (isNaN(correct)) issues.push('Enter how many you got right');
  else if (correct > total) issues.push('Correct can\'t exceed total');
  const untyped = items.filter(it => !it.errorType).length;
  if (untyped) issues.push(`${plural(untyped, 'question')} still need${untyped === 1 ? 's' : ''} "what went wrong"`);
  const badLinks = f.links.filter(u => u && !safeUrl(u)).length;
  if (badLinks) issues.push('A link doesn\'t look like a web address');

  el.innerHTML = `
    <div class="ls-score ${cls}">${acc === null ? '—' : acc + '%'}</div>
    <div class="ls-sub">${valid ? `${correct} of ${total} correct` : 'Score appears here'}</div>
    <div class="ls-rows">
      <div class="ls-row"><span>Misses logged</span><b class="${valid && logged >= missed ? 'ok' : missed ? 'warn' : ''}">${logged}${valid ? ` / ${missed}` : ''}</b></div>
      ${guesses ? `<div class="ls-row"><span>Lucky guesses</span><b>${guesses}</b></div>` : ''}
      <div class="ls-row"><span>Pace</span><b class="${pace && pace > target * 1.1 ? 'warn' : pace ? 'ok' : ''}">${pace ? formatPace(pace) + '/Q' : '—'}</b></div>
      <div class="ls-row"><span>Test pace</span><b>${formatPace(target)}/Q</b></div>
      <div class="ls-row"><span>Links</span><b>${f.links.filter(u => safeUrl(u)).length}</b></div>
    </div>
    ${Object.keys(byType).length ? `<div class="ls-types">${Object.keys(byType).sort((a, b) => byType[b] - byType[a]).map(k => {
      const et = getErrorType(k);
      return `<span class="error-chip" style="--bucket-color:${getBucket(et.bucket).color}">${et.icon} ${escapeHtml(et.label)} × ${byType[k]}</span>`;
    }).join('')}</div>` : ''}
    ${issues.length ? `<ul class="ls-issues">${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : `<div class="ls-ready">✓ Ready to save</div>`}`;
  const cnt = document.getElementById('logMissCount');
  if (cnt) cnt.textContent = valid ? (missed ? `${plural(missed, 'miss', 'misses')} — one card each` : 'perfect set! 💯') : 'enter your score above to get a card per miss';
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
  if (!f.date || !f.subject || !f.provider) { showToast('Please fill in Date, Subject, and Provider'); document.getElementById(f.subject ? 'log-provider' : 'log-subject').focus(); return; }
  if (!total || total < 1 || isNaN(correct) || correct < 0) { showToast('Please enter questions and number correct'); document.getElementById('log-total').focus(); return; }
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
  showPage('practice-list');
  highlightEntry(sid);
  showToast(wasEdit ? 'Entry updated ✓'
    : `Logged ${correct}/${total} — ${pct(correct, total)}%${missed ? ` · ${loggedMiss}/${missed} misses explained` : ' · perfect! 💯'} ✓`);
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
