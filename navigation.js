// ═══════════════════════════════════
// NAVIGATION — page switching, keyboard shortcuts, clock, bootstrap
// ═══════════════════════════════════

// ═══════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════
// Four groups, each a big button in the nav. Pages inside a group get a tab row.
const PAGE_GROUPS = {
  home:    { pages: [['home', 'Home']] },
  log:     { pages: [['log', 'Log a passage']] },
  history: { pages: [['practice-list', 'Passages'], ['mistakes', 'Mistakes']] },
  exams:   { pages: [['fl-list', 'Full-Length Exams']] },
  stats:   { pages: [['analytics', 'Overview'], ['mistake-insights', 'What went wrong'], ['deep-dive', 'Deep dive']] }
};
const lastPageInGroup = {};
let currentPage = 'home';

function groupOf(page) {
  return Object.keys(PAGE_GROUPS).find(g => PAGE_GROUPS[g].pages.some(([p]) => p === page)) || 'home';
}

function showGroup(group) {
  showPage(lastPageInGroup[group] || PAGE_GROUPS[group].pages[0][0]);
}

function renderGroupTabs() {
  const el = document.getElementById('groupTabs');
  if (!el) return;
  const group = groupOf(currentPage);
  document.querySelectorAll('.nav-group').forEach(b => b.classList.toggle('active', b.dataset.group === group));
  if (PAGE_GROUPS[group].pages.length < 2) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = PAGE_GROUPS[group].pages.map(([p, label]) =>
    `<button class="group-tab ${p === currentPage ? 'active' : ''}" onclick="showPage('${p}')">${label}</button>`
  ).join('');
}

function showPage(name) {
  currentPage = name;
  lastPageInGroup[groupOf(name)] = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo({ top: 0 });
  if (name === 'log') ensureLogEditor();
  refreshAll();
  try { history.replaceState(null, '', '#' + name); } catch(e) {}
}

// ═══════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════
const kbdHint = document.getElementById('kbdHint');
let kbdHintTimeout;

function showKbdHint(text) {
  kbdHint.innerHTML = text;
  kbdHint.classList.add('show');
  clearTimeout(kbdHintTimeout);
  kbdHintTimeout = setTimeout(() => kbdHint.classList.remove('show'), 2200);
}

const SHORTCUTS = {
  h: ['home', 'Home'], l: ['log', 'Log a passage'], y: ['practice-list', 'History'],
  x: ['fl-list', 'Exams'], s: ['analytics', 'Stats']
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('paletteOverlay').classList.contains('open')) { closePalette(); return; }
    const open = document.querySelectorAll('.modal-overlay.open');
    if (open.length) { open.forEach(m => m.classList.remove('open')); return; }
    return;
  }
  // Don't fire shortcuts when typing in inputs
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.modal-overlay.open') || document.getElementById('paletteOverlay').classList.contains('open')) return;


  const activePage = document.querySelector('.page.active')?.id;
  const k = e.key.toLowerCase();

  if (k === '/') {
    e.preventDefault();
    const searchFor = { 'page-mistakes': 'mistakeSearch', 'page-content': 'contentSearch' }[activePage];
    if (searchFor) { document.getElementById(searchFor).focus(); return; }
    if (activePage !== 'page-practice-list') showPage('practice-list');
    setTimeout(() => document.getElementById('practiceSearch')?.focus(), 50);
    showKbdHint('<kbd>/</kbd> Search');
    return;
  }
  if (SHORTCUTS[k]) {
    showPage(SHORTCUTS[k][0]);
    return;
  }
  if (k === 'n') { openLogEditor(); return; }
  if (k === 'd') { toggleDarkMode(); return; }
});


// ═══════════════════════════════════
// LIVE CLOCK
// ═══════════════════════════════════
function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('topbarClock');
  const dateEl = document.getElementById('topbarDate');
  if (!timeEl) return;
  const h = now.getHours(), m = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  const mm = String(m).padStart(2, '0');
  timeEl.textContent = `${hh}:${mm} ${ampm}`;
  dateEl.textContent = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}
updateClock();
setInterval(updateClock, 10000);

// ═══════════════════════════════════
// EASTER EGG
// ═══════════════════════════════════
let eggBuffer = '';
const EGG_CODE = 'QUIZ';
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  eggBuffer = (eggBuffer + e.key.toUpperCase()).slice(-EGG_CODE.length);
  if (eggBuffer === EGG_CODE) {
    document.getElementById('easterEggOverlay').classList.add('show');
    launchConfetti();
    eggBuffer = '';
  }
});

// ═══════════════════════════════════
// BOOTSTRAP / INIT
// ═══════════════════════════════════
loadDB();
saveDB(false); // persist any schema migration (not a real change — don't sync)
if (getSyncUrl()) pullFromSheet(); else setSyncStatus('off');
const startPage = (location.hash || '').slice(1);
showPage(document.getElementById('page-' + startPage) ? startPage : 'home');
