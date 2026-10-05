// ═══════════════════════════════════
// MISTAKE JOURNAL — log what went wrong, quick-log a set's misses,
// filter/search the journal, export to Anki
// ═══════════════════════════════════

let editingMistakeId = null;
let mistakeLinkedSessionId = null;
let mistakeSelectedType = null;
let mistakeAnswers = { mine: '', correct: '' };
let mistakeFilters = { bucket: 'all', status: 'all', section: 'all', period: 'all' };
// Drill-down filters (from insights, content tracker, analytics). Keys match mistake fields.
let mistakeDrill = {};
const PAGE_SIZE = 36;
let mistakeShowLimit = PAGE_SIZE;
let lastMistakeSig = '';

const DRILL_LABELS = { errorType: 'Error', concept: 'Concept', provider: 'Provider', subject: 'Subject', section: 'Section', bucket: 'Root cause', sessionId: 'Set', tag: 'Tag' };

// ═══════════════════════════════════
// STATUS / LOOKUPS
// ═══════════════════════════════════
function getMistakeStatus(m) {
  if (!m.review || m.review.reps === 0) return 'new';
  if (m.review.interval >= 21) return 'mastered';
  return 'learning';
}

function isMistakeDue(m) { return (m.review?.due || '') <= todayISO(); }

function getMistakesForSession(sessionId) { return db.mistakes.filter(m => m.sessionId === sessionId); }

// Misses (wrong answers) in a set that don't have a mistake entry yet. Lucky guesses don't count.
function getUnloggedCount(s) {
  const missed = Math.max(0, (Number(s.total) || 0) - (Number(s.correct) || 0));
  const logged = getMistakesForSession(s.id).filter(m => m.errorType !== 'guess').length;
  return Math.max(0, missed - logged);
}

function getSessionsWithUnlogged() {
  return db.sessions.filter(s => getUnloggedCount(s) > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

function getTotalUnlogged() { return db.sessions.reduce((a, s) => a + getUnloggedCount(s), 0); }

function errorTypeOptionsHtml(selected) {
  return `<option value="">— What went wrong? —</option>` + ERROR_BUCKETS.map(b =>
    `<optgroup label="${b.label}">${ERROR_TYPES.filter(e => e.bucket === b.key).map(e =>
      `<option value="${e.key}" ${e.key === selected ? 'selected' : ''}>${e.icon} ${e.label}</option>`).join('')}</optgroup>`
  ).join('');
}

function errorChipHtml(m) {
  const et = getErrorType(m.errorType);
  const b = getBucket(et.bucket);
  return `<span class="error-chip" style="--bucket-color:${b.color}">${et.icon} ${escapeHtml(et.label)}</span>`;
}

// ═══════════════════════════════════
// JOURNAL — render
// ═══════════════════════════════════
function getFilteredMistakes() {
  let list = filterSessionsByPeriod([...db.mistakes], mistakeFilters.period);
  if (mistakeFilters.section !== 'all') list = list.filter(m => m.section === mistakeFilters.section);
  if (mistakeFilters.bucket !== 'all') list = list.filter(m => getErrorType(m.errorType).bucket === mistakeFilters.bucket);
  if (mistakeFilters.status === 'due') list = list.filter(isMistakeDue);
  else if (mistakeFilters.status === 'anki') list = list.filter(m => m.anki);
  else if (mistakeFilters.status !== 'all') list = list.filter(m => getMistakeStatus(m) === mistakeFilters.status);

  for (const k in mistakeDrill) {
    const v = mistakeDrill[k];
    if (!v) continue;
    if (k === 'section') list = list.filter(m => getSection(m.section).short === v);
    else if (k === 'bucket') list = list.filter(m => getErrorType(m.errorType).bucket === v);
    else if (k === 'concept') list = list.filter(m => (m.concept || '').trim().toLowerCase() === v.trim().toLowerCase());
    else if (k === 'tag') list = list.filter(m => (m.tags || []).includes(v));
    else list = list.filter(m => (m[k] || 'Unspecified') === v);
  }

  const q = (document.getElementById('mistakeSearch')?.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter(m => [m.concept, m.subject, m.provider, m.questionRef, m.question, m.what, m.takeaway,
      (m.tags || []).join(' '), getErrorType(m.errorType).label, getSection(m.section).short]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

function renderMistakes() {
  renderTopbarStats();
  const grid = document.getElementById('mistakesGrid');
  if (!grid) return;
  const list = getFilteredMistakes();
  const due = db.mistakes.filter(isMistakeDue).length;

  document.getElementById('mistakeCountLabel').textContent =
    `${plural(db.mistakes.length, 'mistake')} logged · ${due} due for review · ${db.mistakes.filter(m => getMistakeStatus(m) === 'mastered').length} mastered`;
  document.getElementById('mistakeFilterStats').textContent = list.length !== db.mistakes.length ? `${plural(list.length, 'match', 'matches')}` : '';

  renderUnloggedBanner();
  renderMistakeDrillChips();

  // New filters → back to the first page
  const sig = JSON.stringify([mistakeFilters, mistakeDrill, document.getElementById('mistakeSearch')?.value || '']);
  if (sig !== lastMistakeSig) { mistakeShowLimit = PAGE_SIZE; lastMistakeSig = sig; }

  if (!list.length) {
    grid.innerHTML = `<div class="patients-empty-state">
      <div class="patients-empty-icon">🔍</div>
      <div class="patients-empty-title">${db.mistakes.length ? 'No mistakes match' : 'Your mistake journal is empty'}</div>
      <div class="patients-empty-sub">${db.mistakes.length
        ? 'Try adjusting your search or filters'
        : 'Every miss is a lesson. Log what went wrong after each set — the pattern is where your points are.'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = list.slice(0, mistakeShowLimit).map(m => {
    const sec = getSection(m.section);
    const b = getMistakeBucket(m);
    const status = getMistakeStatus(m);
    const due = isMistakeDue(m);
    const statusLabel = due ? 'Due' : { new: 'New', learning: 'Learning', mastered: 'Mastered' }[status];
    return `<div class="mistake-card" style="--bucket-color:${b.color}" onclick="openEditMistakeModal(${jsArg(m.id)})">
      <div class="mistake-card-stripe"></div>
      <div class="mistake-card-body">
        <div class="mistake-card-top">
          ${errorChipHtml(m)}
          <span class="mistake-status ${due ? 'due' : status}">${statusLabel}</span>
        </div>
        <div class="mistake-card-concept">${escapeHtml(m.concept) || escapeHtml(m.subject) || 'Untitled'}</div>
        <div class="mistake-card-meta">
          <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>
          <span>${escapeHtml(m.subject) || '—'}</span>
          <span class="dot">·</span><span>${escapeHtml(m.provider) || '—'}</span>
          ${m.questionRef ? `<span class="dot">·</span><span>${escapeHtml(m.questionRef)}</span>` : ''}
        </div>
        ${m.what ? `<div class="mistake-card-what"><span class="mistake-label">What went wrong</span>${escapeHtml(m.what)}</div>` : ''}
        ${m.takeaway ? `<div class="mistake-card-takeaway">💡 ${escapeHtml(m.takeaway)}</div>` : ''}
        ${(m.tags || []).length ? `<div class="mistake-tags">${m.tags.map(t => `<span>#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="mistake-card-footer">
          <span>${formatDateTiny(m.date)}</span>
          <span class="mistake-card-flags">
            ${m.myAnswer && m.correctAnswer ? `<span class="answer-flip" title="Your answer → correct answer">${escapeHtml(m.myAnswer)} → ${escapeHtml(m.correctAnswer)}</span>` : ''}
            ${m.anki ? '<span title="Flagged for Anki">🃏</span>' : ''}
            ${linkChipHtml(m.link || getSessionLinks(db.sessions.find(x => x.id === m.sessionId))[0] || '', m.link ? 'Q' : 'Passage')}
            <span class="mistake-next" title="Next review">${status === 'mastered' && !due ? '✓' : '↻'} ${due ? 'review now' : relativeDay(m.review.due)}</span>
          </span>
        </div>
      </div>
    </div>`;
  }).join('') + showMoreHtml(list.length, mistakeShowLimit, 'mistakeShowLimit += PAGE_SIZE; renderMistakes()');
}

function showMoreHtml(total, shown, onclick) {
  if (total <= shown) return '';
  return `<div class="show-more-wrap"><button class="confetti-btn" onclick="${onclick}">Show ${Math.min(PAGE_SIZE, total - shown)} more <span>· ${total - shown} remaining</span></button></div>`;
}

function renderUnloggedBanner() {
  const el = document.getElementById('unloggedBanner');
  if (!el) return;
  const sets = getSessionsWithUnlogged();
  const n = sets.reduce((a, s) => a + getUnloggedCount(s), 0);
  if (!n) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = `
    <div class="unlogged-icon">📝</div>
    <div class="unlogged-text"><strong>${plural(n, 'missed question')}</strong> across ${plural(sets.length, 'set')} still ${n === 1 ? 'has' : 'have'} no log.
      <span>The fastest way to raise your score is to know <em>why</em> you miss.</span></div>
    <button class="btn-save" onclick="openUnloggedPicker()">Log them →</button>
  `;
}

function renderMistakeDrillChips() {
  const el = document.getElementById('mistakeActiveFilters');
  if (!el) return;
  const chips = Object.keys(mistakeDrill).filter(k => mistakeDrill[k]).map(k => {
    let v = mistakeDrill[k];
    if (k === 'errorType') v = getErrorType(v).label;
    if (k === 'bucket') v = getBucket(v).label;
    if (k === 'sessionId') { const s = db.sessions.find(x => x.id === v); v = s ? `${s.provider} · ${s.subject} · ${formatDateTiny(s.date)}` : 'deleted set'; }
    return `${DRILL_LABELS[k] || k}: ${escapeHtml(v)}`;
  });
  if (!chips.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  el.innerHTML = `<span class="filter-chip-label">Filtered by:</span>
    ${chips.map(c => `<span class="filter-chip">${c}</span>`).join('')}
    <button class="filter-clear-btn" onclick="clearMistakeDrill()">Clear</button>`;
}

function clearMistakeDrill() { mistakeDrill = {}; renderMistakes(); }

function setMistakeFilter(kind, val, btn) {
  mistakeFilters[kind] = val;
  setActiveChip(btn);
  renderMistakes();
}

// Jump to the journal with drill filters applied
function openMistakesFiltered(drill) {
  mistakeDrill = { ...drill };
  mistakeFilters = { bucket: 'all', status: 'all', section: 'all', period: 'all' };
  document.querySelectorAll('#page-mistakes .pt-chip-row').forEach(row => {
    row.querySelectorAll('.pt-chip').forEach((b, i) => b.classList.toggle('active', i === 0));
  });
  const search = document.getElementById('mistakeSearch');
  if (search) search.value = '';
  showPage('mistakes');
}

// ═══════════════════════════════════
// DETAILED MODAL — add / edit one mistake
// ═══════════════════════════════════
function renderErrorPicker() {
  const el = document.getElementById('mkErrorPicker');
  el.innerHTML = ERROR_BUCKETS.map(b => `
    <div class="error-picker-group">
      <div class="error-picker-label" style="--bucket-color:${b.color}">${b.label}</div>
      <div class="error-picker-chips">
        ${ERROR_TYPES.filter(e => e.bucket === b.key).map(e => `
          <button type="button" class="error-pick ${mistakeSelectedType === e.key ? 'active' : ''}" style="--bucket-color:${b.color}" onclick="pickErrorType('${e.key}')">${e.icon} ${e.label}</button>`).join('')}
      </div>
    </div>`).join('');
  const tip = document.getElementById('mkErrorTip');
  if (mistakeSelectedType) {
    const et = getErrorType(mistakeSelectedType);
    tip.style.display = 'block';
    tip.innerHTML = `<strong>Fix it:</strong> ${escapeHtml(et.tip)}`;
  } else {
    tip.style.display = 'none';
  }
}

function pickErrorType(key) {
  mistakeSelectedType = key;
  renderErrorPicker();
}

function renderAnswerChips() {
  ['mine', 'correct'].forEach(which => {
    const el = document.getElementById(which === 'mine' ? 'mkMyAnswer' : 'mkCorrectAnswer');
    el.innerHTML = ['A', 'B', 'C', 'D'].map(l =>
      `<button type="button" class="answer-chip ${which} ${mistakeAnswers[which] === l ? 'active' : ''}" onclick="pickAnswer('${which}','${l}')">${l}</button>`).join('');
  });
}

function pickAnswer(which, letter) {
  mistakeAnswers[which] = mistakeAnswers[which] === letter ? '' : letter;
  renderAnswerChips();
}

function updateMistakeSubjectOptions() {
  const section = document.getElementById('mk-section').value;
  const used = [...new Set([...db.sessions, ...db.mistakes].map(s => s.subject).filter(Boolean))];
  fillDatalist('mkSubjectOptions', [...new Set([...SUBJECTS_BY_SECTION[section], ...used])]);
  updateMistakeConceptOptions();
}

function updateMistakeConceptOptions() {
  const subject = document.getElementById('mk-subject').value.trim();
  const topics = getTopicsForSubject(subject);
  const used = db.mistakes.filter(m => m.subject === subject).map(m => m.concept).filter(Boolean);
  fillDatalist('mkConceptOptions', [...new Set([...topics, ...used, ...(topics.length ? [] : getAllTopics())])]);
}

function fillMistakeProviderOptions() {
  fillDatalist('mkProviderOptions', [...new Set([...PROVIDERS, ...db.sessions.map(s => s.provider).filter(Boolean)])]);
}

function setMistakeLinkLabel() {
  const el = document.getElementById('mkLinkedSet');
  const s = db.sessions.find(x => x.id === mistakeLinkedSessionId);
  if (s) {
    el.style.display = 'flex';
    el.innerHTML = `🔗 Linked to <strong>${escapeHtml(s.provider)} · ${escapeHtml(s.subject)}</strong> — ${formatDateShort(s.date)} (${s.correct}/${s.total})
      <button type="button" class="filter-clear-btn" onclick="mistakeLinkedSessionId=null;setMistakeLinkLabel()">Unlink</button>`;
  } else {
    el.style.display = 'none';
  }
}

// prefill: optional fields to start from (e.g., from a session)
function openMistakeModalBlank(prefill = {}) {
  editingMistakeId = null;
  mistakeLinkedSessionId = prefill.sessionId || null;
  const s = db.sessions.find(x => x.id === mistakeLinkedSessionId);
  const last = [...db.mistakes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  mistakeSelectedType = prefill.errorType || null;
  mistakeAnswers = { mine: '', correct: '' };
  document.getElementById('mistakeModalTitle').textContent = 'Log a Mistake';
  setMkMore(!!(prefill.tags || []).length);
  document.getElementById('mk-date').value = s?.date || prefill.date || todayISO();
  document.getElementById('mk-section').value = s?.section || prefill.section || last?.section || 'cp';
  document.getElementById('mk-subject').value = s?.subject || prefill.subject || '';
  document.getElementById('mk-provider').value = s?.provider || prefill.provider || last?.provider || '';
  document.getElementById('mk-concept').value = prefill.concept || '';
  document.getElementById('mk-qref').value = '';
  document.getElementById('mk-question').value = '';
  document.getElementById('mk-what').value = '';
  document.getElementById('mk-takeaway').value = '';
  document.getElementById('mk-tags').value = (prefill.tags || []).join(', ');
  document.getElementById('mk-link').value = '';
  document.getElementById('mk-anki').checked = false;
  updateMistakeSubjectOptions(); fillMistakeProviderOptions();
  renderErrorPicker(); renderAnswerChips(); setMistakeLinkLabel();
  document.getElementById('mistakeReviewInfo').style.display = 'none';
  document.getElementById('mistakeDeleteBar').classList.remove('show');
  document.getElementById('mistakeDeleteTrigger').style.display = 'none';
  openModal('mistakeModal');
  setTimeout(() => document.getElementById(s ? 'mk-concept' : 'mk-subject').focus(), 60);
}

function openEditMistakeModal(id) {
  const m = db.mistakes.find(x => x.id === id);
  if (!m) return;
  editingMistakeId = id;
  mistakeLinkedSessionId = m.sessionId || null;
  mistakeSelectedType = m.errorType;
  mistakeAnswers = { mine: m.myAnswer || '', correct: m.correctAnswer || '' };
  document.getElementById('mistakeModalTitle').textContent = 'Edit Mistake';
  const hasMore = m.questionRef || m.question || m.myAnswer || m.correctAnswer || (m.tags || []).length || m.anki || m.link;
  setMkMore(!!hasMore);
  document.getElementById('mk-date').value = m.date || '';
  document.getElementById('mk-section').value = m.section;
  document.getElementById('mk-subject').value = m.subject || '';
  document.getElementById('mk-provider').value = m.provider || '';
  document.getElementById('mk-concept').value = m.concept || '';
  document.getElementById('mk-qref').value = m.questionRef || '';
  document.getElementById('mk-question').value = m.question || '';
  document.getElementById('mk-what').value = m.what || '';
  document.getElementById('mk-takeaway').value = m.takeaway || '';
  document.getElementById('mk-tags').value = (m.tags || []).join(', ');
  document.getElementById('mk-link').value = m.link || '';
  document.getElementById('mk-anki').checked = !!m.anki;
  updateMistakeSubjectOptions(); fillMistakeProviderOptions();
  renderErrorPicker(); renderAnswerChips(); setMistakeLinkLabel();

  const r = m.review;
  const info = document.getElementById('mistakeReviewInfo');
  info.style.display = 'flex';
  info.innerHTML = `
    <span><strong>${{ new: 'New', learning: 'Learning', mastered: 'Mastered' }[getMistakeStatus(m)]}</strong></span>
    <span>Reviewed ${plural(r.reps, 'time')}</span>
    <span>${r.lapses ? plural(r.lapses, 'lapse') : 'no lapses'}</span>
    <span>Next: ${isMistakeDue(m) ? 'due now' : relativeDay(r.due)}</span>
    <button type="button" class="filter-clear-btn" onclick="resetMistakeReview()">Reset schedule</button>`;
  document.getElementById('mistakeDeleteBar').classList.remove('show');
  document.getElementById('mistakeDeleteTrigger').style.display = 'inline-block';
  openModal('mistakeModal');
}

function setMkMore(open) {
  document.getElementById('mkMore').style.display = open ? '' : 'none';
  document.getElementById('mkMoreBtn').firstChild.textContent = `More details ${open ? '▴' : '▾'} `;
}

function resetMistakeReview() {
  const m = db.mistakes.find(x => x.id === editingMistakeId);
  if (!m) return;
  m.review = { interval: 0, ease: 2.5, reps: 0, lapses: 0, due: todayISO(), history: [] };
  saveDB();
  openEditMistakeModal(m.id);
  showToast('Review schedule reset — due today');
}

function saveMistake(andAnother) {
  const date = document.getElementById('mk-date').value || todayISO();
  const section = document.getElementById('mk-section').value;
  const subject = document.getElementById('mk-subject').value.trim();
  const provider = document.getElementById('mk-provider').value.trim();
  const concept = document.getElementById('mk-concept').value.trim();
  const questionRef = document.getElementById('mk-qref').value.trim();
  const question = document.getElementById('mk-question').value.trim();
  const what = document.getElementById('mk-what').value.trim();
  const takeaway = document.getElementById('mk-takeaway').value.trim();
  const tags = document.getElementById('mk-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const anki = document.getElementById('mk-anki').checked;
  const link = safeUrl(document.getElementById('mk-link').value);

  if (!mistakeSelectedType) { showToast('Pick what went wrong — that\'s the whole point 🙂'); return; }
  if (!subject) { showToast('Please add a subject'); return; }

  const fields = {
    date, section, subject, provider, concept, questionRef, question, what, takeaway, tags, anki, link,
    errorType: mistakeSelectedType, myAnswer: mistakeAnswers.mine, correctAnswer: mistakeAnswers.correct,
    sessionId: mistakeLinkedSessionId
  };
  if (editingMistakeId) {
    const m = db.mistakes.find(x => x.id === editingMistakeId);
    if (m) Object.assign(m, fields);
    showToast('Mistake updated ✓');
  } else {
    db.mistakes.push(normalizeMistake({ id: newId('MK'), createdAt: Date.now(), ...fields }));
    showToast(`Logged: ${getErrorType(mistakeSelectedType).label} ✓`);
  }
  saveDB();
  const linked = mistakeLinkedSessionId;
  closeModal('mistakeModal');
  refreshAll();
  if (andAnother) openMistakeModalBlank({ sessionId: linked, section, subject, provider, date, tags });
}

function confirmDeleteMistake() {
  if (!editingMistakeId) return;
  const idx = db.mistakes.findIndex(m => m.id === editingMistakeId);
  if (idx < 0) return;
  const [removed] = db.mistakes.splice(idx, 1);
  saveDB();
  closeModal('mistakeModal');
  refreshAll();
  showToast('Mistake deleted', 'Undo', () => {
    db.mistakes.splice(idx, 0, removed); saveDB(); refreshAll(); showToast('Restored ✓');
  });
}

// ═══════════════════════════════════
// LOGGING A SET'S MISSES — handled by the Daily Log editor
// ═══════════════════════════════════
function openQuickLog(sessionId) { openLogEditor({ sessionId, focusMistakes: true }); }

// Pick which set to log next
function openUnloggedPicker() {
  const sets = getSessionsWithUnlogged();
  const el = document.getElementById('unloggedList');
  el.innerHTML = sets.slice(0, 40).map(s => {
    const sec = getSection(s.section);
    return `<div class="unlogged-row" onclick="closeModal('unloggedModal');openQuickLog(${jsArg(s.id)})">
      <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>
      <div class="unlogged-row-main">
        <div><strong>${escapeHtml(s.provider)}</strong> · ${escapeHtml(s.subject)}${s.topic ? ` — ${escapeHtml(s.topic)}` : ''}</div>
        <div class="unlogged-row-sub">${formatDateShort(s.date)} · ${s.correct}/${s.total} correct</div>
      </div>
      <span class="unlogged-row-count">${getUnloggedCount(s)} to log</span>
    </div>`;
  }).join('') || '<div class="table-empty" style="padding:20px">Everything is logged. 🎯</div>';
  openModal('unloggedModal');
}

// ═══════════════════════════════════
// EXPORTS — Anki (tab-separated) + CSV
// ═══════════════════════════════════
function exportMistakesAnki() {
  let list = getFilteredMistakes();
  const flagged = list.filter(m => m.anki);
  if (flagged.length) list = flagged;
  if (!list.length) { showToast('No mistakes to export'); return; }
  const clean = v => String(v || '').replace(/[\t\r\n]+/g, ' ').trim();
  const rows = list.map(m => {
    const et = getErrorType(m.errorType);
    const front = `<b>[${getSection(m.section).short}] ${clean(m.subject)}${m.concept ? ' — ' + clean(m.concept) : ''}</b>` +
      (m.question ? `<br><br>${clean(m.question)}` : '<br><br>What\'s the key rule here?');
    const back = (m.takeaway ? `<b>${clean(m.takeaway)}</b>` : '') +
      (m.what ? `<br><br><i>My mistake (${clean(et.label)}):</i> ${clean(m.what)}` : '') +
      (m.correctAnswer ? `<br>Correct answer: ${clean(m.correctAnswer)}` : '');
    const tags = ['mcat', getSection(m.section).short.replace('/', ''), clean(m.subject).replace(/[^\w]+/g, '_'), m.errorType, ...(m.tags || []).map(t => t.replace(/\s+/g, '_'))].join(' ');
    return [front, back, tags].join('\t');
  });
  const header = '#separator:tab\n#html:true\n#tags column:3\n';
  downloadFile(`mcat-mistakes-anki-${todayISO()}.txt`, header + rows.join('\n'), 'text/plain');
  showToast(`Exported ${plural(list.length, 'card')} for Anki ✓ (File → Import in Anki)`);
}

function exportMistakesCSV() {
  const list = getFilteredMistakes();
  if (!list.length) { showToast('Nothing to export'); return; }
  const cols = ['date', 'section', 'subject', 'provider', 'concept', 'question_ref', 'error_type', 'root_cause', 'my_answer', 'correct_answer', 'question', 'what_went_wrong', 'takeaway', 'tags', 'status', 'next_review'];
  const esc = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = list.map(m => [
    m.date, getSection(m.section).short, m.subject, m.provider, m.concept, m.questionRef,
    getErrorType(m.errorType).label, getMistakeBucket(m).label, m.myAnswer, m.correctAnswer,
    m.question, m.what, m.takeaway, (m.tags || []).join('; '), getMistakeStatus(m), m.review.due
  ].map(esc).join(','));
  downloadFile(`mcat-mistakes-${todayISO()}.csv`, [cols.join(','), ...rows].join('\n'), 'text/csv');
  showToast(`Exported ${plural(list.length, 'mistake')} ✓`);
}
