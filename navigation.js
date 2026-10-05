// ═══════════════════════════════════
// NAVIGATION — page switching, keyboard shortcuts, clock, bootstrap
// ═══════════════════════════════════

// ═══════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════
// Four groups, each a big button in the nav. Pages inside a group get a tab row.
const PAGE_GROUPS = {
  home:     { pages: [['home', 'Home']] },
  practice: { pages: [['practice-list', '📚 Practice Sets'], ['fl-list', '🧪 Full-Length Exams']] },
  mistakes: { pages: [['mistakes', '📝 Mistake Journal'], ['review', '🔁 Review'], ['mistake-insights', '🔍 Patterns']] },
  progress: { pages: [['analytics', '📊 Analytics'], ['content', '🗺️ Content Checklist']] }
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
  if (group === 'home') { el.style.display = 'none'; return; }
  const due = getDueMistakes().length;
  el.style.display = 'flex';
  el.innerHTML = PAGE_GROUPS[group].pages.map(([p, label]) =>
    `<button class="group-tab ${p === currentPage ? 'active' : ''}" onclick="showPage('${p}')">${label}${p === 'review' && due ? ` <em class="nav-count">${due}</em>` : ''}</button>`
  ).join('');
}

function showPage(name) {
  currentPage = name;
  lastPageInGroup[groupOf(name)] = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo({ top: 0 });
  if (name === 'review') onEnterReview();
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
  h: ['home', 'Home'], l: ['practice-list', 'Practice Log'], m: ['mistakes', 'Mistake Journal'],
  w: ['mistake-insights', 'What Went Wrong'], r: ['review', 'Review Queue'], f: ['fl-list', 'Full-Lengths'],
  a: ['analytics', 'Analytics'], c: ['content', 'Content Tracker']
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('paletteOverlay').classList.contains('open')) { closePalette(); return; }
    const open = document.querySelectorAll('.modal-overlay.open');
    if (open.length) { open.forEach(m => m.classList.remove('open')); return; }
    if (document.getElementById('timerPanel').classList.contains('open')) closeTimer();
    return;
  }
  // Don't fire shortcuts when typing in inputs
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.modal-overlay.open') || document.getElementById('paletteOverlay').classList.contains('open')) return;

  if (e.key === '?') {
    showKbdHint('<kbd>⌘K</kbd> Command palette &nbsp; <kbd>H</kbd> Home &nbsp; <kbd>L</kbd> Log &nbsp; <kbd>M</kbd> Mistakes &nbsp; <kbd>W</kbd> What went wrong &nbsp; <kbd>R</kbd> Review &nbsp; <kbd>F</kbd> FLs &nbsp; <kbd>A</kbd> Analytics &nbsp; <kbd>C</kbd> Content &nbsp; <kbd>N</kbd> New &nbsp; <kbd>E</kbd> Log mistake &nbsp; <kbd>T</kbd> Timer &nbsp; <kbd>P</kbd> Report &nbsp; <kbd>D</kbd> Dark');
    return;
  }

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
  // On the review page, number keys and space belong to the flashcard
  if (activePage === 'page-review' && [' ', '1', '2', '3', '4'].includes(e.key)) return;
  if (SHORTCUTS[k]) {
    showPage(SHORTCUTS[k][0]);
    showKbdHint(`<kbd>${k.toUpperCase()}</kbd> ${SHORTCUTS[k][1]}`);
    return;
  }
  if (k === 'n') {
    if (activePage === 'page-fl-list') { openAddFLModal(); showKbdHint('<kbd>N</kbd> New full-length'); }
    else if (activePage === 'page-mistakes' || activePage === 'page-mistake-insights') { openAddMistakeModal(); showKbdHint('<kbd>N</kbd> Log mistake'); }
    else { openAddSessionModal(); showKbdHint('<kbd>N</kbd> Log practice'); }
    return;
  }
  if (k === 'e') { openAddMistakeModal(); showKbdHint('<kbd>E</kbd> Log a mistake'); return; }
  if (k === 't') { toggleTimerPanel(); showKbdHint('<kbd>T</kbd> Study timer'); return; }
  if (k === 'p') { printStudyReport(); return; }
  if (k === 'd') { toggleDarkMode(); showKbdHint('<kbd>D</kbd> Dark mode'); return; }
});

// Show hint on first load
setTimeout(() => showKbdHint('Press <kbd>?</kbd> for shortcuts · <kbd>⌘K</kbd> for everything'), 2000);

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
saveDB(); // persist any schema migration
checkAchievements(true);
renderTimerButton();
const startPage = (location.hash || '').slice(1);
showPage(document.getElementById('page-' + startPage) ? startPage : 'home');
