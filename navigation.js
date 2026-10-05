// ═══════════════════════════════════
// NAVIGATION — page switching, keyboard shortcuts, clock, bootstrap
// ═══════════════════════════════════

// ═══════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo({ top: 0 });
  if (name === 'home') renderHomeStats();
  if (name === 'practice-list') renderSessions();
  if (name === 'fl-list') renderFullLengths();
  if (name === 'analytics') renderAnalytics();
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

document.addEventListener('keydown', e => {
  // Don't fire shortcuts when typing in inputs
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  // Esc — close any open modal
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    return;
  }

  // ? — show shortcuts cheat sheet
  if (e.key === '?') {
    showKbdHint('<kbd>?</kbd> Help &nbsp; <kbd>H</kbd> Home &nbsp; <kbd>L</kbd> Log &nbsp; <kbd>F</kbd> Full-lengths &nbsp; <kbd>A</kbd> Analytics &nbsp; <kbd>N</kbd> New set &nbsp; <kbd>/</kbd> Search &nbsp; <kbd>D</kbd> Dark &nbsp; <kbd>Esc</kbd> Close');
    return;
  }

  if (document.querySelector('.modal-overlay.open')) return;
  const activePage = document.querySelector('.page.active')?.id;
  const k = e.key.toLowerCase();

  if (k === '/') {
    e.preventDefault();
    if (activePage !== 'page-practice-list') showPage('practice-list');
    setTimeout(() => document.getElementById('practiceSearch')?.focus(), 50);
    showKbdHint('<kbd>/</kbd> Search practice log');
    return;
  }
  if (k === 'h') { showPage('home'); showKbdHint('<kbd>H</kbd> Home'); return; }
  if (k === 'l') { showPage('practice-list'); showKbdHint('<kbd>L</kbd> Practice Log'); return; }
  if (k === 'f') { showPage('fl-list'); showKbdHint('<kbd>F</kbd> Full-Length Exams'); return; }
  if (k === 'a') { showPage('analytics'); showKbdHint('<kbd>A</kbd> Analytics'); return; }
  if (k === 'n') {
    if (activePage === 'page-fl-list') { openAddFLModal(); showKbdHint('<kbd>N</kbd> New full-length'); }
    else { openAddSessionModal(); showKbdHint('<kbd>N</kbd> Log practice'); }
    return;
  }
  if (k === 'd') { toggleDarkMode(); showKbdHint('<kbd>D</kbd> Dark mode'); refreshAll(); return; }
});

// Show hint on first load
setTimeout(() => showKbdHint('Press <kbd>?</kbd> for keyboard shortcuts'), 2000);

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

// Re-draw charts in the right colors when dark mode is toggled from the button
document.getElementById('darkToggleBtn').addEventListener('click', () => refreshAll());

// ═══════════════════════════════════
// EASTER EGG
// ═══════════════════════════════════
let eggBuffer = '';
const EGG_CODE = 'KREBS';
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
renderHomeStats();
