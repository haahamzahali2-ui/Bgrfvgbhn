// ═══════════════════════════════════
// COMMAND PALETTE — Ctrl/⌘ + K to jump anywhere or do anything
// ═══════════════════════════════════

let paletteIndex = 0;
let paletteItems = [];

function getPaletteCommands(query) {
  const cmds = [
    { group: 'Go to', icon: '🏠', label: 'Home', kbd: 'H', run: () => showPage('home') },
    { group: 'Go to', icon: '📚', label: 'Practice Log', kbd: 'L', run: () => showPage('practice-list') },
    { group: 'Go to', icon: '📝', label: 'Mistake Journal', kbd: 'M', run: () => showPage('mistakes') },
    { group: 'Go to', icon: '🔍', label: 'What Went Wrong (mistake insights)', kbd: 'W', run: () => showPage('mistake-insights') },
    { group: 'Go to', icon: '🔁', label: 'Review Queue', kbd: 'R', run: () => showPage('review') },
    { group: 'Go to', icon: '🧪', label: 'Full-Length Exams', kbd: 'F', run: () => showPage('fl-list') },
    { group: 'Go to', icon: '📊', label: 'Practice Analytics', kbd: 'A', run: () => showPage('analytics') },
    { group: 'Go to', icon: '🗺️', label: 'Content Tracker', kbd: 'C', run: () => showPage('content') },
    ...SECTIONS.map(sec => ({ group: 'Go to', icon: '📈', label: `Analytics: ${sec.name}`, run: () => openAnalyticsFor('section', sec.short) })),
    { group: 'Do', icon: '➕', label: 'Log a practice set', kbd: 'N', run: () => openAddSessionModal() },
    { group: 'Do', icon: '❌', label: 'Log a mistake', kbd: 'E', run: () => openAddMistakeModal() },
    { group: 'Do', icon: '🧾', label: `Log unlogged misses${getTotalUnlogged() ? ` (${getTotalUnlogged()})` : ''}`, run: () => openUnloggedPicker() },
    { group: 'Do', icon: '🧠', label: `Start review${getDueMistakes().length ? ` (${getDueMistakes().length} due)` : ''}`, run: () => startReview('due') },
    { group: 'Do', icon: '🧪', label: 'Add a full-length exam', run: () => openAddFLModal() },
    ...SECTIONS.map(sec => ({ group: 'Do', icon: '⏱', label: `Start timed ${sec.short} set`, run: () => openTimer(sec.key) })),
    { group: 'Do', icon: '🍅', label: 'Start a 25-min focus block', run: () => { setTimerMode('focus'); openTimer(); } },
    { group: 'Do', icon: '🌙', label: 'Toggle dark mode', kbd: 'D', run: () => toggleDarkMode() },
    { group: 'Data', icon: '⚙️', label: 'Settings — test date, goals, targets', run: () => openSettingsModal() },
    { group: 'Data', icon: '💾', label: 'Download backup', run: () => exportBackupJSON() },
    { group: 'Data', icon: '🃏', label: 'Export mistakes to Anki', run: () => exportMistakesAnki() },
    { group: 'Data', icon: '🖨️', label: 'Print study report', kbd: 'P', run: () => printStudyReport() },
    { group: 'Data', icon: '⬇', label: 'Export practice log (CSV)', run: () => exportSessionsCSV() },
    { group: 'Data', icon: '✨', label: 'Load sample data', run: () => loadSampleData() }
  ];
  const q = query.trim().toLowerCase();
  if (!q) return cmds;
  const words = q.split(/\s+/);
  const matches = cmds.filter(c => words.every(w => c.label.toLowerCase().includes(w) || c.group.toLowerCase().includes(w)));
  // Search your own data too
  const concepts = getRepeatOffenders(db.mistakes)
    .filter(r => r.concept.toLowerCase().includes(q)).slice(0, 5)
    .map(r => ({ group: 'Concepts', icon: '🔎', label: `${r.concept} — ${plural(r.count, 'mistake')}`, run: () => openMistakesFiltered({ concept: r.concept }) }));
  const topics = getAllTopics().filter(t => t.toLowerCase().includes(q) && !concepts.some(c => c.label.toLowerCase().startsWith(t.toLowerCase()))).slice(0, 3)
    .map(t => ({ group: 'Content outline', icon: '🗺️', label: t, run: () => { contentSearchTerm = t; showPage('content'); document.getElementById('contentSearch').value = t; renderContentTracker(); } }));
  const searchJournal = { group: 'Search', icon: '🔍', label: `Search mistake journal for "${query.trim()}"`, run: () => { openMistakesFiltered({}); document.getElementById('mistakeSearch').value = query.trim(); renderMistakes(); } };
  const searchLog = { group: 'Search', icon: '🔍', label: `Search practice log for "${query.trim()}"`, run: () => { showPage('practice-list'); document.getElementById('practiceSearch').value = query.trim(); renderSessions(); } };
  return [...matches, ...concepts, ...topics, searchJournal, searchLog];
}

function openPalette() {
  const ov = document.getElementById('paletteOverlay');
  ov.classList.add('open');
  const input = document.getElementById('paletteInput');
  input.value = '';
  renderPalette();
  setTimeout(() => input.focus(), 20);
}

function closePalette() { document.getElementById('paletteOverlay').classList.remove('open'); }

function renderPalette() {
  const q = document.getElementById('paletteInput').value;
  paletteItems = getPaletteCommands(q);
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  if (!q) paletteIndex = 0;
  let lastGroup = '';
  document.getElementById('paletteList').innerHTML = paletteItems.map((c, i) => {
    const head = c.group !== lastGroup ? `<div class="palette-group">${c.group}</div>` : '';
    lastGroup = c.group;
    return `${head}<div class="palette-item ${i === paletteIndex ? 'active' : ''}" data-i="${i}" onmousemove="setPaletteIndex(${i})" onclick="runPalette(${i})">
      <span class="palette-icon">${c.icon}</span><span class="palette-label">${escapeHtml(c.label)}</span>${c.kbd ? `<kbd>${c.kbd}</kbd>` : ''}
    </div>`;
  }).join('') || '<div class="palette-empty">No matches</div>';
}

function setPaletteIndex(i) {
  if (i === paletteIndex) return;
  paletteIndex = i;
  document.querySelectorAll('#paletteList .palette-item').forEach(el => el.classList.toggle('active', Number(el.dataset.i) === i));
}

function runPalette(i) {
  const c = paletteItems[i];
  if (!c) return;
  closePalette();
  c.run();
}

function onPaletteKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = paletteItems.length;
    if (!n) return;
    setPaletteIndex((paletteIndex + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    document.querySelector('#paletteList .palette-item.active')?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault(); runPalette(paletteIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault(); closePalette();
  }
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const ov = document.getElementById('paletteOverlay');
    if (ov.classList.contains('open')) closePalette(); else openPalette();
  }
});
