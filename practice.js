// ═══════════════════════════════════
// PRACTICE LOG — render, CRUD, filters, CSV export
// ═══════════════════════════════════

let currentPracticeSection = 'all';
let currentPracticePeriod = 'all';
let sessionShowLimit = 36;
let lastSessionSig = '';
// Drill-down filters set from analytics (AND). Values match getDimValue() output.
let practiceDrillFilters = { section: null, subject: null, provider: null };

// ═══════════════════════════════════
// DIMENSIONS — shared with analytics
// ═══════════════════════════════════
function getDimValue(s, dim) {
  if (dim === 'section')  return getSection(s.section).short;
  if (dim === 'subject')  return s.subject || 'Unspecified';
  if (dim === 'provider') return s.provider || 'Unspecified';
  return '';
}

const DIM_LABELS = { section: 'Section', subject: 'Subject', provider: 'Provider' };
const DIM_LABELS_PLURAL = { section: 'Sections', subject: 'Subjects', provider: 'Providers' };

// ═══════════════════════════════════
// RENDER — practice set cards
// ═══════════════════════════════════
function getFilteredSessions() {
  let list = filterSessionsByPeriod([...db.sessions], currentPracticePeriod);
  if (currentPracticeSection !== 'all') list = list.filter(s => s.section === currentPracticeSection);
  for (const dim in practiceDrillFilters) {
    const val = practiceDrillFilters[dim];
    if (val) list = list.filter(s => getDimValue(s, dim) === val);
  }
  const search = (document.getElementById('practiceSearch')?.value || '').trim().toLowerCase();
  if (search) {
    list = list.filter(s =>
      [s.subject, s.provider, s.topic, s.notes, getSection(s.section).short, getSection(s.section).name, ...getSessionLinks(s),
        ...getMistakesForSession(s.id).flatMap(m => [m.concept, m.question, m.what, m.takeaway])]
        .some(v => String(v || '').toLowerCase().includes(search))
    );
  }
  // Most recent first; newest entry first within a day
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

function renderSessions() {
  renderTopbarStats();
  const grid = document.getElementById('sessionsGrid');
  if (!grid) return;
  const list = getFilteredSessions();

  const countEl = document.getElementById('practiceCountLabel');
  if (countEl) {
    const days = new Set(db.sessions.map(s => s.date)).size;
    countEl.textContent = `${plural(db.sessions.length, 'entry', 'entries')} across ${plural(days, 'day')} · ${plural(db.mistakes.length, 'question')} explained`;
  }

  const statsEl = document.getElementById('practiceFilterStats');
  if (statsEl) {
    const sum = summarizeSessions(list);
    statsEl.textContent = list.length ? `${plural(list.length, 'entry', 'entries')} · ${sum.questions} Qs · ${sum.accuracy}% correct` : '';
  }

  renderPracticeActiveFilters();

  const sig = JSON.stringify([currentPracticeSection, currentPracticePeriod, practiceDrillFilters, document.getElementById('practiceSearch')?.value || '']);
  if (sig !== lastSessionSig) { sessionShowLimit = PAGE_SIZE; lastSessionSig = sig; }

  const todayBox = document.getElementById('historyToday');
  if (todayBox) todayBox.innerHTML = todayPromptHtml();

  if (list.length === 0) {
    grid.innerHTML = `<div class="patients-empty-state">
      <div class="patients-empty-icon">📅</div>
      <div class="patients-empty-title">${db.sessions.length ? 'No entries match' : 'Your log is empty'}</div>
      <div class="patients-empty-sub">${db.sessions.length
        ? 'Try adjusting your search or filters'
        : 'Do a set, then log it here with everything you missed. <a href="#" onclick="loadSampleData();return false;">Or load sample data</a> to explore.'}</div>
    </div>`;
    return;
  }

  // Group the visible page of entries by day
  const shown = list.slice(0, sessionShowLimit);
  const days = [];
  shown.forEach(s => {
    const d = days[days.length - 1];
    if (d && d.date === s.date) d.items.push(s); else days.push({ date: s.date, items: [s] });
  });
  grid.innerHTML = days.map(d => {
    const allDay = list.filter(s => s.date === d.date);
    const sum = summarizeSessions(allDay);
    const explained = allDay.reduce((a, s) => a + getMistakesForSession(s.id).length, 0);
    const rel = d.date === todayISO() ? 'Today' : d.date === addDaysISO(todayISO(), -1) ? 'Yesterday' : parseLocalDate(d.date)?.toLocaleDateString('en-US', { weekday: 'long' }) || '';
    return `<div class="day-group">
      <div class="day-head">
        <div class="day-title">${rel} <span>${formatDateShort(d.date)}</span></div>
        <div class="day-stats">${plural(allDay.length, 'entry', 'entries')} · ${sum.questions} Qs · <b class="${getAccuracyClass(sum.accuracy)}">${sum.accuracy}%</b>${sum.minutes ? ` · ${Math.round(sum.minutes)} min` : ''} · ${plural(explained, 'question')} explained</div>
      </div>
      ${d.items.map(entryCardHtml).join('')}
    </div>`;
  }).join('') + showMoreHtml(list.length, sessionShowLimit, 'sessionShowLimit += PAGE_SIZE; renderSessions()');
}

function entryCardHtml(s) {
  const sec = getSection(s.section);
  const acc = pct(s.correct, s.total);
  const accClass = getAccuracyClass(acc);
  const missed = Math.max(0, s.total - s.correct);
  const ms = getMistakesForSession(s.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const unlogged = getUnloggedCount(s);
  const pace = Number(s.minutes) > 0 ? formatPace(Math.round(s.minutes * 60 / s.total)) : null;
  const links = getSessionLinks(s);
  return `<div class="entry-card ${accClass}" data-entry="${escapeHtml(s.id)}">
    <div class="entry-main" onclick="openLogEditor({ sessionId: ${jsArg(s.id)} })">
      <div class="entry-score ${accClass}">${acc}%<small>${s.correct}/${s.total}</small></div>
      <div class="entry-info">
        <div class="entry-title"><span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span> ${escapeHtml(s.provider)} · ${escapeHtml(s.subject)}</div>
        ${s.topic ? `<div class="entry-topic">${escapeHtml(s.topic)}</div>` : ''}
        <div class="entry-meta">
          ${Number(s.minutes) > 0 ? `<span>⏱ ${escapeHtml(s.minutes)} min · ${pace}/Q</span>` : ''}
          ${links.map((u, i) => linkChipHtml(u, links.length > 1 ? `Passage ${i + 1}` : 'Open passage')).join('')}
        </div>
      </div>
      <div class="entry-side">
        <span class="session-log-state ${!missed ? 'perfect' : unlogged ? (unlogged < missed ? 'partial' : 'none') : 'done'}">${!missed ? '💯 Perfect' : unlogged ? `${missed - unlogged}/${missed} explained` : `✓ All ${missed} explained`}</span>
        <span class="entry-edit">Edit ›</span>
      </div>
    </div>
    ${ms.length ? `<div class="entry-misses">${ms.map(m => {
      const et = getErrorType(m.errorType);
      return `<div class="em-row" onclick="openLogEditor({ sessionId: ${jsArg(s.id)} })" title="Edit">
        <span class="em-q">${escapeHtml(m.questionRef) || (m.errorType === 'guess' ? '🍀' : '•')}</span>
        ${m.myAnswer || m.correctAnswer ? `<span class="answer-flip">${escapeHtml(m.myAnswer || '?')} → ${escapeHtml(m.correctAnswer || '?')}</span>` : ''}
        <span class="error-chip" style="--bucket-color:${getBucket(et.bucket).color}">${et.icon} ${escapeHtml(et.label)}</span>
        <span class="em-text">${m.concept ? `<b>${escapeHtml(m.concept)}</b>` : ''}${m.question ? ` — ${escapeHtml(m.question)}` : ''}${m.takeaway ? `<span class="em-take">💡 ${escapeHtml(m.takeaway)}</span>` : ''}</span>
        ${m.link ? linkChipHtml(m.link, 'Q') : ''}
      </div>`;
    }).join('')}</div>` : ''}
    ${unlogged ? `<div class="entry-unlogged"><span>📝 ${plural(unlogged, 'miss', 'misses')} not explained yet</span><button class="session-log-btn" onclick="openLogEditor({ sessionId: ${jsArg(s.id)}, focusMistakes: true })">Explain ${unlogged === 1 ? 'it' : 'them'} →</button></div>` : ''}
    ${s.notes ? `<div class="entry-notes">📓 ${escapeHtml(s.notes)}</div>` : ''}
  </div>`;
}

// "Did you log today?" prompt at the top of the history
function todayPromptHtml() {
  const today = db.sessions.filter(s => s.date === todayISO());
  if (!today.length) return `<div class="today-prompt empty"><span>📅 <b>Nothing logged today yet.</b> Did a passage or a question set? Log it while it's fresh.</span><button class="btn-save" onclick="openLogEditor()">+ Log a passage</button></div>`;
  const sum = summarizeSessions(today);
  const unl = today.reduce((a, s) => a + getUnloggedCount(s), 0);
  return `<div class="today-prompt"><span>✅ <b>Today:</b> ${plural(today.length, 'entry', 'entries')} · ${sum.questions} Qs · ${sum.accuracy}%${unl ? ` · <b class="warn">${unl} still to explain</b>` : ' · everything explained'}</span><button class="btn-save" onclick="openLogEditor()">+ Log another</button></div>`;
}

// ═══════════════════════════════════
// ACTIVE FILTER CHIPS (from analytics drill-down)
// ═══════════════════════════════════
function renderPracticeActiveFilters() {
  const el = document.getElementById('practiceActiveFilters');
  if (!el) return;
  const chips = Object.keys(practiceDrillFilters)
    .filter(dim => practiceDrillFilters[dim])
    .map(dim => `${DIM_LABELS[dim]}: ${escapeHtml(practiceDrillFilters[dim])}`);
  if (chips.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  el.innerHTML = `
    <span class="filter-chip-label">Filtered by:</span>
    ${chips.map(c => `<span class="filter-chip">${c}</span>`).join('')}
    <button class="filter-clear-btn" onclick="clearPracticeDrillFilters()">Clear</button>
  `;
}

function clearPracticeDrillFilters() {
  practiceDrillFilters = { section: null, subject: null, provider: null };
  renderSessions();
}

// Called from analytics — jump to the log filtered by up to two dimensions
function openPracticeListFiltered(filters) {
  practiceDrillFilters = { section: null, subject: null, provider: null, ...filters };
  currentPracticeSection = 'all';
  currentPracticePeriod = currentAnalyticsTimeFilter || 'all';
  const searchEl = document.getElementById('practiceSearch');
  if (searchEl) searchEl.value = '';
  syncChipRow('practiceSectionChips', 0);
  syncChipRow('practicePeriodChips', ['all', '7days', '30days', '90days'].indexOf(currentPracticePeriod));
  showPage('practice-list');
}

function syncChipRow(rowId, activeIdx) {
  document.querySelectorAll(`#${rowId} .pt-chip`).forEach((b, i) => b.classList.toggle('active', i === activeIdx));
}

// ═══════════════════════════════════
// FILTER / SEARCH
// ═══════════════════════════════════
function setPracticeSectionFilter(filter, btn) {
  currentPracticeSection = filter;
  document.querySelectorAll('#practiceSectionChips .pt-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSessions();
}

function setPracticePeriodFilter(filter, btn) {
  currentPracticePeriod = filter;
  document.querySelectorAll('#practicePeriodChips .pt-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSessions();
}

function filterSessions() { renderSessions(); }

// ═══════════════════════════════════
// ADD / EDIT — everything goes through the Daily Log editor (logbook.js)
// ═══════════════════════════════════
function openAddSessionModal(prefill = {}) { openLogEditor({ prefill }); }
function openEditSessionModal(id) { openLogEditor({ sessionId: id }); }

// ═══════════════════════════════════
// CSV EXPORT — the currently filtered list
// ═══════════════════════════════════
function exportSessionsCSV() {
  const list = getFilteredSessions();
  if (!list.length) { showToast('Nothing to export'); return; }
  const cols = ['date', 'section', 'subject', 'provider', 'topic', 'links', 'total', 'correct', 'accuracy_pct', 'minutes', 'notes'];
  const esc = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = list.map(s => [
    s.date, getSection(s.section).short, s.subject, s.provider, s.topic, getSessionLinks(s).join(' '),
    s.total, s.correct, pct(s.correct, s.total), s.minutes || '', s.notes
  ].map(esc).join(','));
  downloadFile(`mcat-practice-${todayISO()}.csv`, [cols.join(','), ...rows].join('\n'), 'text/csv');
  showToast(`Exported ${list.length} sets ✓`);
}
