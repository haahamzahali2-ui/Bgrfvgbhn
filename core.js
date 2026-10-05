// ═══════════════════════════════════
// CORE — data store, constants, helpers, modals, backups, home stats
// ═══════════════════════════════════

// DATA STORE
// ═══════════════════════════════════
const STORAGE_KEY = 'mcat_prep_data';

let db = { sessions: [], fullLengths: [], settings: { testDate: '', targetScore: '', targetAccuracy: 75 } };

// ═══════════════════════════════════
// MCAT CONSTANTS
// ═══════════════════════════════════
const SECTIONS = [
  { key: 'cp',   short: 'C/P',  name: 'Chem/Phys',   full: 'Chemical & Physical Foundations of Biological Systems', color: '#2980B9' },
  { key: 'cars', short: 'CARS', name: 'CARS',        full: 'Critical Analysis & Reasoning Skills',                  color: '#8E44AD' },
  { key: 'bb',   short: 'B/B',  name: 'Bio/Biochem', full: 'Biological & Biochemical Foundations of Living Systems', color: '#2E7D52' },
  { key: 'ps',   short: 'P/S',  name: 'Psych/Soc',   full: 'Psychological, Social & Biological Foundations of Behavior', color: '#D4850A' }
];

const SUBJECTS_BY_SECTION = {
  cp:   ['General Chemistry', 'Physics', 'Organic Chemistry', 'Biochemistry', 'Biology', 'Research & Stats'],
  cars: ['CARS — Humanities', 'CARS — Social Sciences', 'CARS — Mixed'],
  bb:   ['Biology', 'Biochemistry', 'General Chemistry', 'Organic Chemistry', 'Research & Stats'],
  ps:   ['Psychology', 'Sociology', 'Biology', 'Research & Stats']
};

const PROVIDERS = [
  'AAMC', 'UWorld', 'Jack Westin', 'Khan Academy', 'Blueprint', 'Kaplan',
  'Princeton Review', 'Altius', 'Examkrackers', 'MedSchoolCoach', 'Anki', 'Other'
];

const FL_PROVIDERS = ['AAMC', 'Blueprint', 'UWorld', 'Kaplan', 'Princeton Review', 'Altius', 'Jack Westin', 'Examkrackers', 'Other'];

// Rotating palette for non-section groups (subjects, providers)
const GROUP_COLORS = ['#A8893C', '#2980B9', '#8E44AD', '#2E7D52', '#D4850A', '#C0392B', '#16A085', '#1A5276', '#A04000', '#884EA0'];

function getSection(key) { return SECTIONS.find(s => s.key === key) || SECTIONS[0]; }
function getSectionByShort(short) { return SECTIONS.find(s => s.short === short); }

// ═══════════════════════════════════
// LOAD / SAVE
// ═══════════════════════════════════
function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { try { db = JSON.parse(raw); } catch(e) {} }
  normalizeDB();
}

function normalizeDB() {
  if (!db || typeof db !== 'object') db = {};
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.fullLengths)) db.fullLengths = [];
  if (!db.settings) db.settings = {};
  if (!('testDate' in db.settings)) db.settings.testDate = '';
  if (!('targetScore' in db.settings)) db.settings.targetScore = '';
  if (!db.settings.targetAccuracy) db.settings.targetAccuracy = 75;
}

function saveDB() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch(e) { showToast('Could not save — browser storage is full or blocked.'); }
}

function newId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════
function escapeHtml(input) {
  return String(input ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00'); // force local timezone, avoid UTC shift
  return isNaN(d) ? null : d;
}

function formatDateShort(iso) {
  const d = parseLocalDate(iso);
  if (!d) return iso || '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

// 'high' | 'medium' | 'low' relative to the user's target accuracy
function getAccuracyClass(acc) {
  const target = Number(db.settings.targetAccuracy) || 75;
  if (acc >= target) return 'high';
  if (acc >= target - 15) return 'medium';
  return 'low';
}

function getDaysUntilTest() {
  const d = parseLocalDate(db.settings.testDate);
  if (!d) return null;
  const today = parseLocalDate(todayISO());
  return Math.round((d - today) / 86400000);
}

function getFLTotal(fl) { return Number(fl.cp) + Number(fl.cars) + Number(fl.bb) + Number(fl.ps); }

function getSortedFLs() {
  return [...db.fullLengths].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// Period filter shared by practice log + analytics
function getPeriodStart(filter) {
  const days = { '7days': 7, '30days': 30, '90days': 90 }[filter];
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filterSessionsByPeriod(sessions, filter) {
  const start = getPeriodStart(filter);
  return start ? sessions.filter(s => (s.date || '') >= start) : sessions;
}

// Totals for any subset of practice sets
function summarizeSessions(sessions) {
  let questions = 0, correct = 0, minutes = 0, timedQuestions = 0;
  sessions.forEach(s => {
    questions += Number(s.total) || 0;
    correct   += Number(s.correct) || 0;
    if (Number(s.minutes) > 0) { minutes += Number(s.minutes); timedQuestions += Number(s.total) || 0; }
  });
  return {
    sessions: sessions.length, questions, correct, minutes,
    accuracy: pct(correct, questions),
    secPerQ: timedQuestions ? Math.round((minutes * 60) / timedQuestions) : null
  };
}

// ═══════════════════════════════════
// MODALS / TOAST
// ═══════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 3000);
}

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = values.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
}

// ═══════════════════════════════════
// SETTINGS
// ═══════════════════════════════════
function openSettingsModal() {
  document.getElementById('set-test-date').value = db.settings.testDate || '';
  document.getElementById('set-target').value = db.settings.targetScore || '';
  document.getElementById('set-target-acc').value = db.settings.targetAccuracy || 75;
  document.getElementById('clearDataBar').classList.remove('show');
  document.getElementById('settingsModal').classList.add('open');
}

function saveSettings() {
  const target = document.getElementById('set-target').value;
  const targetAcc = Number(document.getElementById('set-target-acc').value);
  if (target && (Number(target) < 472 || Number(target) > 528)) { showToast('Target score must be between 472 and 528'); return; }
  if (targetAcc && (targetAcc < 1 || targetAcc > 100)) { showToast('Target accuracy must be between 1 and 100'); return; }
  db.settings.testDate = document.getElementById('set-test-date').value;
  db.settings.targetScore = target;
  db.settings.targetAccuracy = targetAcc || 75;
  saveDB();
  closeModal('settingsModal');
  refreshAll();
  showToast('Settings saved ✓');
}

// ═══════════════════════════════════
// BACKUP / RESTORE
// ═══════════════════════════════════
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportBackupJSON() {
  downloadFile(`mcat-tracker-backup-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json');
  showToast('Backup downloaded ✓');
}

function importBackupJSON(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.fullLengths)) throw new Error('bad file');
      db = data; normalizeDB(); saveDB();
      closeModal('settingsModal'); refreshAll();
      showToast(`Restored ${db.sessions.length} sets and ${db.fullLengths.length} exams ✓`);
    } catch(e) {
      showToast('That file is not a valid MCAT tracker backup.');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

function clearAllData() {
  db = { sessions: [], fullLengths: [], settings: db.settings };
  saveDB();
  closeModal('settingsModal'); refreshAll();
  showToast('All practice data erased');
}

// ═══════════════════════════════════
// DARK MODE
// ═══════════════════════════════════
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('mcat_dark_mode', isDark ? '1' : '0');
  document.getElementById('darkToggleBtn').textContent = isDark ? '☀️' : '🌙';
}
if (localStorage.getItem('mcat_dark_mode') === '1') {
  document.body.classList.add('dark-mode');
  document.getElementById('darkToggleBtn').textContent = '☀️';
}

// ═══════════════════════════════════
// CONFETTI
// ═══════════════════════════════════
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confettiPieces = [];
let confettiRunning = false;

function launchConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  const colors = ['#C9A84C','#F0D98A','#2E7D52','#4caf78','#E8D5A3','#ffffff'];
  confettiPieces = Array.from({length: 120}, () => ({
    x: Math.random() * confettiCanvas.width,
    y: Math.random() * -200,
    w: Math.random() * 10 + 5,
    h: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 4,
    vx: (Math.random() - 0.5) * 3,
    vy: Math.random() * 3 + 2,
    opacity: 1
  }));
  if (!confettiRunning) animateConfetti();
}

function animateConfetti() {
  confettiRunning = true;
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiPieces.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.rot += p.rotSpeed;
    if (p.y > confettiCanvas.height * 0.7) p.opacity -= 0.02;
    confettiCtx.save();
    confettiCtx.globalAlpha = Math.max(0, p.opacity);
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot * Math.PI / 180);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    confettiCtx.restore();
  });
  confettiPieces = confettiPieces.filter(p => p.opacity > 0);
  if (confettiPieces.length > 0) requestAnimationFrame(animateConfetti);
  else { confettiRunning = false; confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }
}

// ═══════════════════════════════════
// ANIMATED COUNTERS
// ═══════════════════════════════════
function animateCount(el, target, duration = 1200, suffix = '') {
  if (!el) return;
  const startTime = performance.now();
  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ═══════════════════════════════════
// TOPBAR + HOME STATS
// ═══════════════════════════════════
function renderTopbarStats() {
  const sum = summarizeSessions(db.sessions);
  const fls = getSortedFLs();
  const latest = fls.slice(-1)[0];
  const days = getDaysUntilTest();

  document.getElementById('stat-questions').textContent = sum.questions.toLocaleString();
  document.getElementById('stat-accuracy').textContent = sum.questions ? `${sum.accuracy}%` : '—';
  document.getElementById('stat-latest-fl').textContent = latest ? getFLTotal(latest) : '—';
  document.getElementById('stat-days-left').textContent = days === null ? '—' : Math.max(days, 0);
}

function renderHomeStats() {
  renderTopbarStats();
  const sum = summarizeSessions(db.sessions);
  const fls = db.fullLengths;
  const best = fls.length ? Math.max(...fls.map(getFLTotal)) : null;

  animateCount(document.getElementById('imp-questions'), sum.questions);
  animateCount(document.getElementById('imp-accuracy'), sum.accuracy, 1200, '%');
  animateCount(document.getElementById('imp-hours'), Math.round(sum.minutes / 60));
  document.getElementById('imp-best-fl').textContent = best ?? '—';

  const days = getDaysUntilTest();
  const countdown = document.getElementById('homeCountdown');
  if (countdown) {
    if (days === null) countdown.innerHTML = `<a href="#" onclick="openSettingsModal();return false;">Set your test date</a> to start the countdown`;
    else if (days > 0) countdown.textContent = `${days} day${days !== 1 ? 's' : ''} until test day — ${formatDateShort(db.settings.testDate)}`;
    else if (days === 0) countdown.textContent = 'Test day is today. You\'ve got this. 🩺';
    else countdown.textContent = `Test taken ${formatDateShort(db.settings.testDate)} — update your date in settings`;
  }
  renderSectionSnapshot();
}

// One card per MCAT section — practice accuracy + latest full-length section score
function renderSectionSnapshot() {
  const row = document.getElementById('sectionSnapshotRow');
  if (!row) return;
  const latestFL = getSortedFLs().slice(-1)[0];
  row.innerHTML = SECTIONS.map(sec => {
    const sum = summarizeSessions(db.sessions.filter(s => s.section === sec.key));
    const accClass = sum.questions ? getAccuracyClass(sum.accuracy) : '';
    return `<div class="snapshot-card" style="--sec-color:${sec.color}" onclick="openAnalyticsFor('section','${sec.short}')">
      <div class="snapshot-card-top">
        <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>
        <span class="snapshot-card-fl">${latestFL ? `FL ${escapeHtml(latestFL[sec.key])}` : ''}</span>
      </div>
      <div class="snapshot-card-name">${sec.name}</div>
      <div class="snapshot-card-val ${accClass}">${sum.questions ? sum.accuracy + '%' : '—'}</div>
      <div class="snapshot-card-sub">${sum.questions.toLocaleString()} question${sum.questions !== 1 ? 's' : ''} · ${sum.sessions} set${sum.sessions !== 1 ? 's' : ''}</div>
    </div>`;
  }).join('');
}

// Re-render whatever page is visible after data changes
function refreshAll() {
  renderHomeStats();
  const active = document.querySelector('.page.active')?.id;
  if (active === 'page-practice-list') renderSessions();
  if (active === 'page-fl-list') renderFullLengths();
  if (active === 'page-analytics') renderAnalytics();
}
