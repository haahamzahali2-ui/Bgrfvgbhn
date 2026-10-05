// ═══════════════════════════════════
// CORE — data store, constants, helpers, modals, backups, topbar
// ═══════════════════════════════════

// DATA STORE
// ═══════════════════════════════════
const STORAGE_KEY = 'mcat_prep_data';
const DB_VERSION = 2;

let db = {
  version: DB_VERSION,
  sessions: [], fullLengths: [], mistakes: [],
  contentStatus: {}, achievements: {},
  settings: { testDate: '', targetScore: '', targetAccuracy: 75, weeklyGoal: 300, dailyReviewGoal: 20, promptMistakes: true }
};

// ═══════════════════════════════════
// MCAT CONSTANTS
// ═══════════════════════════════════
const SECTIONS = [
  { key: 'cp',   short: 'C/P',  name: 'Chem/Phys',   full: 'Chemical & Physical Foundations of Biological Systems', color: '#2980B9', questions: 59, minutes: 95 },
  { key: 'cars', short: 'CARS', name: 'CARS',        full: 'Critical Analysis & Reasoning Skills',                  color: '#8E44AD', questions: 53, minutes: 90 },
  { key: 'bb',   short: 'B/B',  name: 'Bio/Biochem', full: 'Biological & Biochemical Foundations of Living Systems', color: '#2E7D52', questions: 59, minutes: 95 },
  { key: 'ps',   short: 'P/S',  name: 'Psych/Soc',   full: 'Psychological, Social & Biological Foundations of Behavior', color: '#D4850A', questions: 59, minutes: 95 }
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
// WHAT WENT WRONG — error taxonomy
// Every error type rolls up into a root-cause bucket, so you can tell
// "I need more content" apart from "I'm giving away points I already know".
// ═══════════════════════════════════
const ERROR_BUCKETS = [
  { key: 'knowledge', label: 'Knowledge',  color: '#2980B9', blurb: 'You didn\'t know or couldn\'t recall the content.', fix: 'Content review + Anki' },
  { key: 'reasoning', label: 'Reasoning',  color: '#8E44AD', blurb: 'You knew the content but the logic or data broke down.', fix: 'Passage practice + explain-it-back' },
  { key: 'execution', label: 'Execution',  color: '#D4850A', blurb: 'Misreads, math slips, careless errors — points you already own.', fix: 'Slow the final read, verify' },
  { key: 'strategy',  label: 'Strategy',   color: '#C0392B', blurb: 'Test-taking traps: distractors, second-guessing, extreme answers.', fix: 'Predict, eliminate, commit' },
  { key: 'timing',    label: 'Timing',     color: '#16A085', blurb: 'You rushed or ran out of time.', fix: 'Pacing drills + triage' },
  { key: 'guess',     label: 'Lucky Guess', color: '#A8893C', blurb: 'Right answer, wrong confidence — still worth reviewing.', fix: 'Review like a miss' }
];

const ERROR_TYPES = [
  { key: 'content',     label: 'Content Gap',               icon: '📚', bucket: 'knowledge', tip: 'Re-learn the concept from a content source, then make 2–3 Anki cards in your own words.' },
  { key: 'recall',      label: 'Forgot / Couldn\'t Recall',  icon: '🧠', bucket: 'knowledge', tip: 'You\'ve seen this before — spaced repetition fixes recall. Review it in the queue until it sticks.' },
  { key: 'misread_q',   label: 'Misread Question',          icon: '👀', bucket: 'execution', tip: 'Re-read the last sentence of the stem before choosing. Circle NOT / EXCEPT / LEAST.' },
  { key: 'misread_p',   label: 'Misread Passage / Figure',  icon: '📄', bucket: 'execution', tip: 'Check axes, units, and legends first. Re-find the exact line in the passage before answering.' },
  { key: 'math',        label: 'Calculation Error',         icon: '🧮', bucket: 'execution', tip: 'Use scientific notation and round aggressively. Sanity-check the order of magnitude.' },
  { key: 'careless',    label: 'Careless / Silly',          icon: '🤦', bucket: 'execution', tip: 'Before clicking, ask: "Does this answer the exact question asked?" These are free points.' },
  { key: 'data',        label: 'Data / Graph Interpretation', icon: '📈', bucket: 'reasoning', tip: 'Summarize every figure in one sentence (trend + variables) before reading the questions.' },
  { key: 'reasoning',   label: 'Reasoning / Logic',         icon: '🧩', bucket: 'reasoning', tip: 'Write out the chain of logic. Find which link you assumed instead of proved.' },
  { key: 'research',    label: 'Research Design / Stats',   icon: '🔬', bucket: 'reasoning', tip: 'Name the IV, DV, controls, and what the stat actually tests before answering.' },
  { key: 'distractor',  label: 'Fell for Distractor',       icon: '🎣', bucket: 'strategy',  tip: 'Predict the answer before reading choices. Half-true answers are still wrong.' },
  { key: 'narrowed',    label: 'Narrowed to 2, Picked Wrong', icon: '⚖️', bucket: 'strategy', tip: 'Find the ONE word that differs between the final two and test it against the passage.' },
  { key: 'changed',     label: 'Changed Right → Wrong',     icon: '🔄', bucket: 'strategy',  tip: 'Only change an answer when you find concrete new evidence — not a feeling.' },
  { key: 'scope',       label: 'Out of Scope / Too Extreme', icon: '🎯', bucket: 'strategy', tip: 'Prefer moderate answers the passage directly supports. Watch "always", "never", "only".' },
  { key: 'timing',      label: 'Rushed / Out of Time',      icon: '⏱️', bucket: 'timing',    tip: 'Triage: flag long calculations and come back. Keep ~1.5 min per question.' },
  { key: 'guess',       label: 'Lucky Guess (got it right)', icon: '🍀', bucket: 'guess',    tip: 'You got credit but not certainty. Review it like a miss so it\'s real next time.' }
];

function getErrorType(key) { return ERROR_TYPES.find(e => e.key === key) || ERROR_TYPES[0]; }
function getBucket(key) { return ERROR_BUCKETS.find(b => b.key === key) || ERROR_BUCKETS[0]; }
function getMistakeBucket(m) { return getBucket(getErrorType(m.errorType).bucket); }
// "Avoidable" = execution + strategy + timing — points you lose without a content gap
const AVOIDABLE_BUCKETS = ['execution', 'strategy', 'timing'];

// ═══════════════════════════════════
// LOAD / SAVE / MIGRATE
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
  if (!Array.isArray(db.mistakes)) db.mistakes = [];
  if (!db.contentStatus || typeof db.contentStatus !== 'object') db.contentStatus = {};
  if (!db.achievements || typeof db.achievements !== 'object') db.achievements = {};
  if (!db.settings) db.settings = {};
  const s = db.settings;
  if (!('testDate' in s)) s.testDate = '';
  if (!('targetScore' in s)) s.targetScore = '';
  if (!s.targetAccuracy) s.targetAccuracy = 75;
  if (!s.weeklyGoal) s.weeklyGoal = 300;
  if (!s.dailyReviewGoal) s.dailyReviewGoal = 20;
  if (!('promptMistakes' in s)) s.promptMistakes = true;
  db.mistakes.forEach(normalizeMistake);
  db.version = DB_VERSION;
}

function normalizeMistake(m) {
  if (!m.review) m.review = {};
  const r = m.review;
  if (typeof r.interval !== 'number') r.interval = 0;
  if (typeof r.ease !== 'number') r.ease = 2.5;
  if (typeof r.reps !== 'number') r.reps = 0;
  if (typeof r.lapses !== 'number') r.lapses = 0;
  if (!r.due) r.due = addDaysISO(m.date || todayISO(), 1);
  if (!Array.isArray(r.history)) r.history = [];
  if (!Array.isArray(m.tags)) m.tags = [];
  return m;
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

// Safely embed a string as a JS argument inside an inline HTML handler
function jsArg(v) { return escapeHtml(JSON.stringify(v)); }

function isoFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO() { return isoFromDate(new Date()); }

function parseLocalDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00'); // force local timezone, avoid UTC shift
  return isNaN(d) ? null : d;
}

function addDaysISO(iso, n) {
  const d = parseLocalDate(iso) || new Date();
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}

function daysBetween(fromIso, toIso) {
  const a = parseLocalDate(fromIso), b = parseLocalDate(toIso);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

function formatDateShort(iso) {
  const d = parseLocalDate(iso);
  if (!d) return iso || '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTiny(iso) {
  const d = parseLocalDate(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
}

function relativeDay(iso) {
  const n = daysBetween(todayISO(), iso);
  if (n === null) return '—';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 0) return n < 60 ? `in ${n} days` : `in ${Math.round(n / 30)} mo`;
  return -n < 60 ? `${-n} days ago` : `${Math.round(-n / 30)} mo ago`;
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }
function plural(n, word, pluralWord) { return `${n} ${n === 1 ? word : (pluralWord || word + 's')}`; }

// 'high' | 'medium' | 'low' relative to the user's target accuracy
function getAccuracyClass(acc) {
  const target = Number(db.settings.targetAccuracy) || 75;
  if (acc >= target) return 'high';
  if (acc >= target - 15) return 'medium';
  return 'low';
}

function getDaysUntilTest() {
  if (!db.settings.testDate) return null;
  return daysBetween(todayISO(), db.settings.testDate);
}

function getFLTotal(fl) { return Number(fl.cp) + Number(fl.cars) + Number(fl.bb) + Number(fl.ps); }

function getSortedFLs() {
  return [...db.fullLengths].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// Period filter shared by practice log, mistakes, and analytics
function getPeriodStart(filter) {
  const days = { '7days': 7, '30days': 30, '90days': 90 }[filter];
  return days ? addDaysISO(todayISO(), -days + 1) : null;
}

function filterSessionsByPeriod(items, filter) {
  const start = getPeriodStart(filter);
  return start ? items.filter(s => (s.date || '') >= start) : items;
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

// Target pace for a section in seconds per question (real exam timing)
function getTargetPace(sectionKey) {
  const sec = getSection(sectionKey);
  return Math.round((sec.minutes * 60) / sec.questions);
}

// ═══════════════════════════════════
// MODALS / TOAST (with optional action, e.g. Undo)
// ═══════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showToast(msg, actionLabel, actionFn) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  if (actionLabel && actionFn) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.onclick = () => { t.classList.remove('show'); actionFn(); };
    t.appendChild(btn);
    t.classList.add('has-action');
  } else {
    t.classList.remove('has-action');
  }
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 3200);
}

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('mousedown', e => { if (e.target === o) o.classList.remove('open'); });
});

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = values.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
}

// Toggle a chip row: one active button
function setActiveChip(btn) {
  if (!btn) return;
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ═══════════════════════════════════
// SETTINGS
// ═══════════════════════════════════
function openSettingsModal() {
  document.getElementById('set-test-date').value = db.settings.testDate || '';
  document.getElementById('set-target').value = db.settings.targetScore || '';
  document.getElementById('set-target-acc').value = db.settings.targetAccuracy || 75;
  document.getElementById('clearDataBar').classList.remove('show');
  openModal('settingsModal');
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
  localStorage.setItem('mcat_last_backup', todayISO());
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
      showToast(`Restored ${plural(db.sessions.length, 'set')}, ${plural(db.mistakes.length, 'mistake')}, ${plural(db.fullLengths.length, 'exam')} ✓`);
    } catch(e) {
      showToast('That file is not a valid MCAT tracker backup.');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

function clearAllData() {
  db = { version: DB_VERSION, sessions: [], fullLengths: [], mistakes: [], contentStatus: {}, achievements: {}, settings: db.settings };
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
  document.getElementById('darkToggleBtn').textContent = isDark ? '☀️ Light' : '🌙 Dark';
  refreshAll();
}
if (localStorage.getItem('mcat_dark_mode') === '1') {
  document.body.classList.add('dark-mode');
  document.getElementById('darkToggleBtn').textContent = '☀️ Light';
} else {
  document.getElementById('darkToggleBtn').textContent = '🌙 Dark';
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
    el.textContent = Math.round(target * eased).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ═══════════════════════════════════
// TOPBAR
// ═══════════════════════════════════
function renderTopbarStats() {
  if (typeof renderGroupTabs === 'function') renderGroupTabs();
}

// Show/hide a block with a "▾ / ▴" toggle button
function toggleBlock(id, btn, label) {
  const el = document.getElementById(id);
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  if (btn) btn.firstChild.textContent = `${label} ${open ? '▴' : '▾'} `;
}

function toggleDropdown(btn) {
  const dd = btn.closest('.dropdown');
  const wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  if (!wasOpen) dd.classList.add('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  else if (e.target.closest('.dropdown-menu button')) e.target.closest('.dropdown').classList.remove('open');
});

// Re-render whatever page is visible after data changes
function refreshAll() {
  renderTopbarStats();
  const active = document.querySelector('.page.active')?.id?.replace('page-', '');
  const renderers = {
    'home': () => renderHome(),
    'practice-list': () => renderSessions(),
    'log': () => updateLogSummary(),
    'fl-list': () => renderFullLengths(),
    'analytics': () => renderAnalytics(),
    'deep-dive': () => renderDeepDive(),
    'mistakes': () => renderMistakes(),
    'mistake-insights': () => renderMistakeInsights(),
    'review': () => renderReview(),
    'content': () => renderContentTracker()
  };
  if (renderers[active]) renderers[active]();
}
