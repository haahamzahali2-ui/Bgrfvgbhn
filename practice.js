// ═══════════════════════════════════
// PRACTICE LOG — render, CRUD, filters, CSV export
// ═══════════════════════════════════

let currentPracticeSection = 'all';
let currentPracticePeriod = 'all';
let editingSessionId = null;
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
      [s.subject, s.provider, s.topic, s.notes, getSection(s.section).short, getSection(s.section).name]
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
  if (countEl) countEl.textContent = `${db.sessions.length} practice set${db.sessions.length !== 1 ? 's' : ''} logged`;

  const statsEl = document.getElementById('practiceFilterStats');
  if (statsEl) {
    const sum = summarizeSessions(list);
    statsEl.textContent = list.length ? `${list.length} set${list.length !== 1 ? 's' : ''} · ${sum.questions} Qs · ${sum.accuracy}% correct` : '';
  }

  renderPracticeActiveFilters();

  const sig = JSON.stringify([currentPracticeSection, currentPracticePeriod, practiceDrillFilters, document.getElementById('practiceSearch')?.value || '']);
  if (sig !== lastSessionSig) { sessionShowLimit = PAGE_SIZE; lastSessionSig = sig; }

  if (list.length === 0) {
    grid.innerHTML = `<div class="patients-empty-state">
      <div class="patients-empty-icon">📚</div>
      <div class="patients-empty-title">${db.sessions.length ? 'No practice sets match' : 'No practice logged yet'}</div>
      <div class="patients-empty-sub">${db.sessions.length
        ? 'Try adjusting your search or filters'
        : 'Log your first question set, or <a href="#" onclick="loadSampleData();return false;">load sample data</a> to explore'}</div>
    </div>`;
    return;
  }

  grid.innerHTML = list.slice(0, sessionShowLimit).map(s => {
    const sec = getSection(s.section);
    const acc = pct(s.correct, s.total);
    const accClass = getAccuracyClass(acc);
    const missed = Math.max(0, s.total - s.correct);
    const logged = getMistakesForSession(s.id).filter(m => m.errorType !== 'guess').length;
    const logState = !missed ? 'perfect' : logged >= missed ? 'done' : logged ? 'partial' : 'none';
    const logLabel = !missed ? '💯 Perfect set' : logged >= missed ? `✓ All ${missed} misses logged` : `📝 ${logged}/${missed} misses logged`;
    return `<div class="session-card ${accClass}" onclick="openEditSessionModal(${jsArg(s.id)})">
      <div class="session-card-stripe"></div>
      <div class="session-card-body">
        <div class="session-card-header">
          <div class="session-card-id-group">
            <span class="session-card-id-label">${escapeHtml(s.provider) || 'Provider'}</span>
            <span class="session-card-acc ${accClass}">${acc}%</span>
          </div>
          <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>
        </div>
        <div class="session-card-subject">${escapeHtml(s.subject) || '—'}</div>
        <div class="session-card-topic">${escapeHtml(s.topic) || '&nbsp;'}</div>
        <div class="session-card-dates">
          <div class="session-date-block">
            <div class="session-date-label">Date</div>
            <div class="session-date-val">${formatDateShort(s.date)}</div>
          </div>
          <div class="session-date-block">
            <div class="session-date-label">Score</div>
            <div class="session-date-val">${escapeHtml(s.correct)} / ${escapeHtml(s.total)}</div>
          </div>
          <div class="session-date-block">
            <div class="session-date-label">Time</div>
            <div class="session-date-val">${Number(s.minutes) > 0 ? escapeHtml(s.minutes) + ' min' : '—'}</div>
          </div>
        </div>
        ${s.notes ? `<div class="session-card-notes">${escapeHtml(s.notes)}</div>` : ''}
        <div class="session-log-row">
          <span class="session-log-state ${logState}">${logLabel}</span>
          ${missed ? `<button class="session-log-btn" onclick="event.stopPropagation();${logState === 'done' ? `openMistakesFiltered({ sessionId: ${jsArg(s.id)} })` : `openQuickLog(${jsArg(s.id)})`}">${logState === 'done' ? 'View' : 'Log misses'} →</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('') + showMoreHtml(list.length, sessionShowLimit, 'sessionShowLimit += PAGE_SIZE; renderSessions()');
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
// MODAL — ADD / EDIT
// ═══════════════════════════════════
function updateSubjectOptions() {
  const section = document.getElementById('ses-section').value;
  // Suggested subjects for the section first, then anything else you've used before
  const used = [...new Set(db.sessions.map(s => s.subject).filter(Boolean))];
  fillDatalist('subjectOptions', [...new Set([...SUBJECTS_BY_SECTION[section], ...used])]);
  if (section === 'cars' && !document.getElementById('ses-subject').value) {
    document.getElementById('ses-subject').value = 'CARS — Mixed';
  }
}

function fillProviderOptions() {
  const used = db.sessions.map(s => s.provider).filter(Boolean);
  fillDatalist('providerOptions', [...new Set([...PROVIDERS, ...used])]);
}

// prefill: optional { section, total, minutes } (e.g., from the study timer)
function openAddSessionModal(prefill = {}) {
  editingSessionId = null;
  const last = [...db.sessions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  document.getElementById('sessionModalTitle').textContent = 'Log Practice';
  document.getElementById('ses-date').value = todayISO();
  // Pre-fill section + provider from your last entry to make batch logging quick
  document.getElementById('ses-section').value = prefill.section || last?.section || 'cp';
  document.getElementById('ses-subject').value = '';
  document.getElementById('ses-provider').value = last?.provider || '';
  document.getElementById('ses-topic').value = '';
  document.getElementById('ses-total').value = prefill.total || '';
  document.getElementById('ses-correct').value = '';
  document.getElementById('ses-minutes').value = prefill.minutes || '';
  document.getElementById('ses-notes').value = '';
  updateSubjectOptions(); fillProviderOptions(); updateSessionPreview();
  document.getElementById('sessionDeleteBar').classList.remove('show');
  document.getElementById('sessionDeleteTrigger').style.display = 'none';
  document.getElementById('sessionMistakeInfo').style.display = 'none';
  document.getElementById('sessionModal').classList.add('open');
  setTimeout(() => document.getElementById('ses-subject').focus(), 60);
}

function openEditSessionModal(id) {
  const s = db.sessions.find(x => x.id === id);
  if (!s) return;
  editingSessionId = id;
  document.getElementById('sessionModalTitle').textContent = 'Edit Practice Set';
  document.getElementById('ses-date').value = s.date || '';
  document.getElementById('ses-section').value = s.section;
  document.getElementById('ses-subject').value = s.subject || '';
  document.getElementById('ses-provider').value = s.provider || '';
  document.getElementById('ses-topic').value = s.topic || '';
  document.getElementById('ses-total').value = s.total;
  document.getElementById('ses-correct').value = s.correct;
  document.getElementById('ses-minutes').value = s.minutes || '';
  document.getElementById('ses-notes').value = s.notes || '';
  updateSubjectOptions(); fillProviderOptions(); updateSessionPreview();
  document.getElementById('sessionDeleteBar').classList.remove('show');
  document.getElementById('sessionDeleteTrigger').style.display = 'inline-block';
  renderSessionMistakeInfo(s);
  document.getElementById('sessionModal').classList.add('open');
}

// "What went wrong" status inside the edit-set modal
function renderSessionMistakeInfo(s) {
  const el = document.getElementById('sessionMistakeInfo');
  const missed = Math.max(0, s.total - s.correct);
  const logged = getMistakesForSession(s.id);
  const wrong = logged.filter(m => m.errorType !== 'guess').length;
  if (!missed && !logged.length) { el.style.display = 'none'; return; }
  const types = {};
  logged.forEach(m => { types[m.errorType] = (types[m.errorType] || 0) + 1; });
  el.style.display = 'block';
  el.innerHTML = `
    <div class="smi-head">
      <span>📝 <strong>${wrong}/${missed}</strong> misses logged${logged.length - wrong ? ` · ${logged.length - wrong} lucky guess${logged.length - wrong > 1 ? 'es' : ''}` : ''}</span>
      <span class="smi-actions">
        ${logged.length ? `<button type="button" class="filter-clear-btn" onclick="closeModal('sessionModal');openMistakesFiltered({ sessionId: ${jsArg(s.id)} })">View</button>` : ''}
        <button type="button" class="filter-clear-btn" onclick="closeModal('sessionModal');openQuickLog(${jsArg(s.id)})">Log what went wrong →</button>
      </span>
    </div>
    ${logged.length ? `<div class="smi-chips">${Object.keys(types).map(k => {
      const et = getErrorType(k);
      return `<span class="error-chip" style="--bucket-color:${getBucket(et.bucket).color}">${et.icon} ${escapeHtml(et.label)} × ${types[k]}</span>`;
    }).join('')}</div>` : ''}`;
}

// Live accuracy preview, same pattern as the BP preview in Helping Hands
function updateSessionPreview() {
  const total = parseInt(document.getElementById('ses-total').value, 10);
  const correct = parseInt(document.getElementById('ses-correct').value, 10);
  const minutes = parseFloat(document.getElementById('ses-minutes').value);
  const el = document.getElementById('sessionLivePreview');
  if (!total || isNaN(correct)) { el.className = 'live-preview'; el.textContent = ''; return; }
  if (correct > total) { el.className = 'live-preview low'; el.innerHTML = '⚠️ <strong>Correct can\'t exceed total questions</strong>'; return; }
  const acc = pct(correct, total);
  const cls = getAccuracyClass(acc);
  const icon = cls === 'high' ? '✅' : cls === 'medium' ? '🟡' : '🔻';
  const label = cls === 'high' ? 'On target' : cls === 'medium' ? 'Close to target' : 'Needs review';
  const pace = minutes > 0 ? ` · ${Math.round((minutes * 60) / total)} sec / question` : '';
  el.className = `live-preview ${cls}`;
  el.innerHTML = `${icon} <strong>${acc}% — ${label}</strong> &nbsp;·&nbsp; <span style="font-weight:400;opacity:0.8">${correct} of ${total} correct${pace}</span>`;
}

// ═══════════════════════════════════
// SAVE / DELETE
// ═══════════════════════════════════
function saveSession() {
  const date = document.getElementById('ses-date').value;
  const section = document.getElementById('ses-section').value;
  const subject = document.getElementById('ses-subject').value.trim();
  const provider = document.getElementById('ses-provider').value.trim();
  const topic = document.getElementById('ses-topic').value.trim();
  const total = parseInt(document.getElementById('ses-total').value, 10);
  const correct = parseInt(document.getElementById('ses-correct').value, 10);
  const minutesRaw = document.getElementById('ses-minutes').value;
  const minutes = minutesRaw ? Math.max(0, parseFloat(minutesRaw)) : 0;
  const notes = document.getElementById('ses-notes').value.trim();

  if (!date || !subject || !provider) { showToast('Please fill in Date, Subject, and Provider'); return; }
  if (!total || total < 1 || isNaN(correct) || correct < 0) { showToast('Please enter questions and number correct'); return; }
  if (correct > total) { showToast('Correct can\'t be more than total questions'); return; }

  const fields = { date, section, subject, provider, topic, total, correct, minutes, notes };
  let newSetId = null;
  if (editingSessionId) {
    const s = db.sessions.find(x => x.id === editingSessionId);
    if (s) Object.assign(s, fields);
    showToast('Practice set updated ✓');
  } else {
    newSetId = newId('SET');
    db.sessions.push({ id: newSetId, createdAt: Date.now(), ...fields });
    showToast(`Logged ${correct}/${total} — ${pct(correct, total)}% ✓`);
  }
  saveDB();
  closeModal('sessionModal');
  refreshAll();
  // Strike while it's fresh: go straight to "what went wrong"
  if (newSetId && correct < total && db.settings.promptMistakes) openQuickLog(newSetId);
}

function confirmDeleteSession() {
  if (!editingSessionId) return;
  const idx = db.sessions.findIndex(s => s.id === editingSessionId);
  if (idx < 0) return;
  const [removed] = db.sessions.splice(idx, 1);
  saveDB();
  closeModal('sessionModal');
  refreshAll();
  // Linked mistakes are kept — they're still lessons
  showToast('Practice set deleted', 'Undo', () => {
    db.sessions.splice(idx, 0, removed); saveDB(); refreshAll(); showToast('Restored ✓');
  });
}

// ═══════════════════════════════════
// CSV EXPORT — the currently filtered list
// ═══════════════════════════════════
function exportSessionsCSV() {
  const list = getFilteredSessions();
  if (!list.length) { showToast('Nothing to export'); return; }
  const cols = ['date', 'section', 'subject', 'provider', 'topic', 'total', 'correct', 'accuracy_pct', 'minutes', 'notes'];
  const esc = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = list.map(s => [
    s.date, getSection(s.section).short, s.subject, s.provider, s.topic,
    s.total, s.correct, pct(s.correct, s.total), s.minutes || '', s.notes
  ].map(esc).join(','));
  downloadFile(`mcat-practice-${todayISO()}.csv`, [cols.join(','), ...rows].join('\n'), 'text/csv');
  showToast(`Exported ${list.length} sets ✓`);
}
