// ═══════════════════════════════════
// PRACTICE LOG — render, CRUD, filters, CSV export
// ═══════════════════════════════════

let currentPracticeSection = 'all';
let currentPracticePeriod = 'all';
let editingSessionId = null;
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

  grid.innerHTML = list.map(s => {
    const sec = getSection(s.section);
    const acc = pct(s.correct, s.total);
    const accClass = getAccuracyClass(acc);
    return `<div class="session-card ${accClass}" onclick="openEditSessionModal('${escapeHtml(s.id)}')">
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
      </div>
    </div>`;
  }).join('');
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

function openAddSessionModal() {
  editingSessionId = null;
  const last = [...db.sessions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  document.getElementById('sessionModalTitle').textContent = 'Log Practice';
  document.getElementById('ses-date').value = todayISO();
  // Pre-fill section + provider from your last entry to make batch logging quick
  document.getElementById('ses-section').value = last?.section || 'cp';
  document.getElementById('ses-subject').value = '';
  document.getElementById('ses-provider').value = last?.provider || '';
  document.getElementById('ses-topic').value = '';
  document.getElementById('ses-total').value = '';
  document.getElementById('ses-correct').value = '';
  document.getElementById('ses-minutes').value = '';
  document.getElementById('ses-notes').value = '';
  updateSubjectOptions(); fillProviderOptions(); updateSessionPreview();
  document.getElementById('sessionDeleteBar').classList.remove('show');
  document.getElementById('sessionDeleteTrigger').style.display = 'none';
  document.getElementById('sessionModal').classList.add('open');
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
  document.getElementById('sessionModal').classList.add('open');
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
  if (editingSessionId) {
    const s = db.sessions.find(x => x.id === editingSessionId);
    if (s) Object.assign(s, fields);
    showToast('Practice set updated ✓');
  } else {
    db.sessions.push({ id: newId('SET'), createdAt: Date.now(), ...fields });
    showToast(`Logged ${correct}/${total} — ${pct(correct, total)}% ✓`);
  }
  saveDB();
  closeModal('sessionModal');
  refreshAll();
}

function confirmDeleteSession() {
  if (!editingSessionId) return;
  db.sessions = db.sessions.filter(s => s.id !== editingSessionId);
  saveDB();
  closeModal('sessionModal');
  refreshAll();
  showToast('Practice set deleted');
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

// ═══════════════════════════════════
// SAMPLE DATA — for exploring the app
// ═══════════════════════════════════
function loadSampleData() {
  const plan = [
    ['cp', 'General Chemistry', 'UWorld', 'Acids & bases'],
    ['cp', 'Physics', 'Khan Academy', 'Fluids'],
    ['cp', 'Organic Chemistry', 'Blueprint', 'Carbonyl chemistry'],
    ['cp', 'Biochemistry', 'AAMC', 'C/P Section Bank'],
    ['cars', 'CARS — Humanities', 'Jack Westin', 'Daily CARS passage'],
    ['cars', 'CARS — Social Sciences', 'Jack Westin', 'Daily CARS passage'],
    ['cars', 'CARS — Mixed', 'AAMC', 'CARS Question Pack Vol. 1'],
    ['cars', 'CARS — Mixed', 'UWorld', 'CARS block'],
    ['bb', 'Biology', 'UWorld', 'Endocrine system'],
    ['bb', 'Biochemistry', 'Khan Academy', 'Enzyme kinetics'],
    ['bb', 'Biochemistry', 'AAMC', 'B/B Section Bank'],
    ['bb', 'Biology', 'Kaplan', 'Genetics'],
    ['ps', 'Psychology', 'Khan Academy', 'Learning & memory'],
    ['ps', 'Sociology', 'UWorld', 'Social stratification'],
    ['ps', 'Psychology', 'AAMC', 'P/S Section Bank'],
    ['ps', 'Research & Stats', 'Blueprint', 'Experimental design']
  ];
  const base = { cp: 0.62, cars: 0.6, bb: 0.68, ps: 0.72 };
  const created = [];
  for (let day = 56; day >= 1; day--) {
    if (day % 7 === 0) continue; // a rest day each week
    const d = new Date(); d.setDate(d.getDate() - day);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const perDay = 1 + (day % 3 === 0 ? 1 : 0);
    for (let k = 0; k < perDay; k++) {
      const [section, subject, provider, topic] = plan[(day * 3 + k * 5) % plan.length];
      const total = section === 'cars' ? 6 + (day % 2) * 5 : [10, 15, 20, 25][(day + k) % 4];
      const progress = (56 - day) / 56 * 0.14; // steady improvement over 8 weeks
      const noise = (((day * 7 + k * 13) % 11) - 5) / 100;
      const acc = Math.min(0.97, Math.max(0.3, base[section] + progress + noise));
      const correct = Math.round(total * acc);
      const minutes = Math.round(total * (section === 'cars' ? 1.6 : 1.5));
      created.push({ id: newId('SET'), createdAt: Date.now() - day * 86400000 + k, date, section, subject, provider, topic, total, correct, minutes, notes: '' });
    }
  }
  const flPlan = [
    [49, 'Blueprint', 'Blueprint Diagnostic', 124, 123, 125, 126],
    [35, 'AAMC', 'AAMC Unscored Sample', 125, 124, 126, 127],
    [21, 'AAMC', 'AAMC FL 1', 126, 125, 127, 128],
    [7, 'AAMC', 'AAMC FL 2', 127, 126, 128, 129]
  ];
  const fls = flPlan.map(([daysAgo, provider, name, cp, cars, bb, ps]) => {
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { id: newId('FL'), createdAt: Date.now(), date, provider, name, cp, cars, bb, ps, notes: '' };
  });
  db.sessions.push(...created);
  db.fullLengths.push(...fls);
  if (!db.settings.testDate) {
    const t = new Date(); t.setDate(t.getDate() + 45);
    db.settings.testDate = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
  if (!db.settings.targetScore) db.settings.targetScore = 515;
  saveDB();
  closeModal('settingsModal');
  refreshAll();
  showToast(`Loaded ${created.length} sample sets and ${fls.length} exams — clear them anytime in ⚙️ Settings`);
}
