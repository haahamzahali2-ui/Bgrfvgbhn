// ═══════════════════════════════════
// STUDY TIMER — timed practice sets at real test pace, plus a 25/5 focus timer.
// State lives in localStorage so a reload doesn't lose a running set.
// ═══════════════════════════════════

const TIMER_KEY = 'mcat_timer';
const FOCUS_MIN = 25, BREAK_MIN = 5;

let timer = loadTimer();
let timerTick = null;

function loadTimer() {
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY));
    if (t && typeof t === 'object') return t;
  } catch(e) {}
  return { mode: 'set', section: 'cp', questions: 10, running: false, startedAt: 0, banked: 0, phase: 'focus', focusDone: 0, focusDate: '' };
}

function saveTimer() { try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch(e) {} }

function timerElapsedMs() { return timer.banked + (timer.running ? Date.now() - timer.startedAt : 0); }

function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timerTargetMs() {
  if (timer.mode === 'focus') return (timer.phase === 'focus' ? FOCUS_MIN : BREAK_MIN) * 60000;
  return (Number(timer.questions) || 1) * getTargetPace(timer.section) * 1000;
}

function isTimerActive() { return timer.running || timer.banked > 0; }

// ═══════════════════════════════════
// PANEL
// ═══════════════════════════════════
function openTimer(sectionKey) {
  if (sectionKey && !isTimerActive()) { timer.mode = 'set'; timer.section = sectionKey; saveTimer(); }
  document.getElementById('timerPanel').classList.add('open');
  renderTimer();
}

function closeTimer() { document.getElementById('timerPanel').classList.remove('open'); }
function toggleTimerPanel() {
  const p = document.getElementById('timerPanel');
  if (p.classList.contains('open')) closeTimer(); else openTimer();
}

function setTimerMode(mode) {
  if (isTimerActive()) { showToast('Finish or discard the running timer first'); return; }
  timer.mode = mode; timer.phase = 'focus'; saveTimer(); renderTimer();
}

function setTimerSection(key) { timer.section = key; saveTimer(); renderTimer(); }

function setTimerQuestions(n) {
  timer.questions = Math.max(1, Math.min(230, parseInt(n, 10) || 1));
  saveTimer(); renderTimer();
}

function renderTimer() {
  const body = document.getElementById('timerBody');
  if (!body) return;
  const active = isTimerActive();
  document.querySelectorAll('#timerModeTabs button').forEach(b => b.classList.toggle('active', b.dataset.mode === timer.mode));

  if (timer.mode === 'focus') {
    if (timer.focusDate !== todayISO()) { timer.focusDate = todayISO(); timer.focusDone = 0; }
    const remaining = timerTargetMs() - timerElapsedMs();
    body.innerHTML = `
      <div class="timer-phase ${timer.phase}">${timer.phase === 'focus' ? '🎯 Focus' : '☕ Break'}</div>
      <div class="timer-clock" id="timerClockBig">${fmtClock(remaining)}</div>
      <div class="timer-bar"><span id="timerBarFill" style="width:${Math.min(100, (timerElapsedMs() / timerTargetMs()) * 100)}%"></span></div>
      <div class="timer-sub">${timer.focusDone} focus block${timer.focusDone !== 1 ? 's' : ''} today · ${FOCUS_MIN}/${BREAK_MIN} min cycles</div>
      <div class="timer-actions">
        ${timer.running ? `<button class="btn-cancel" onclick="pauseTimer()">Pause</button>` : `<button class="btn-save" onclick="startTimer()">${active ? 'Resume' : 'Start'}</button>`}
        ${active ? `<button class="btn-cancel" onclick="resetTimer()">Reset</button>` : ''}
      </div>`;
  } else if (!active) {
    const sec = getSection(timer.section);
    const pace = getTargetPace(timer.section);
    body.innerHTML = `
      <div class="timer-field-label">Section</div>
      <div class="timer-sections">${SECTIONS.map(s => `<button class="${s.key === timer.section ? 'active' : ''}" style="--sec-color:${s.color}" onclick="setTimerSection('${s.key}')">${s.short}</button>`).join('')}</div>
      <div class="timer-field-label">Questions</div>
      <div class="timer-q-row">
        <button onclick="setTimerQuestions(${Number(timer.questions) - 1})">−</button>
        <input type="number" min="1" value="${timer.questions}" onchange="setTimerQuestions(this.value)" />
        <button onclick="setTimerQuestions(${Number(timer.questions) + 1})">+</button>
        <button class="timer-preset" onclick="setTimerQuestions(${sec.questions})">Full section (${sec.questions})</button>
      </div>
      <div class="timer-target">Test pace: <strong>${formatPace(pace)}</strong>/question → target <strong>${fmtClock(timer.questions * pace * 1000)}</strong></div>
      <div class="timer-actions"><button class="btn-save" onclick="startTimer()">▶ Start set</button></div>`;
  } else {
    const sec = getSection(timer.section);
    const elapsed = timerElapsedMs();
    const target = timerTargetMs();
    const shouldBeDone = Math.min(timer.questions, Math.floor(elapsed / (getTargetPace(timer.section) * 1000)));
    body.innerHTML = `
      <div class="timer-running-head"><span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span> ${timer.questions} questions ${timer.running ? '' : '<span class="timer-paused">· paused</span>'}</div>
      <div class="timer-clock" id="timerClockBig">${fmtClock(elapsed)}</div>
      <div class="timer-bar"><span id="timerBarFill" class="${elapsed > target ? 'over' : elapsed > target * 0.9 ? 'near' : ''}" style="width:${Math.min(100, (elapsed / target) * 100)}%"></span></div>
      <div class="timer-sub" id="timerPaceLine">Target ${fmtClock(target)} · at test pace you'd be on Q${Math.min(timer.questions, shouldBeDone + 1)}</div>
      <div class="timer-actions">
        ${timer.running ? `<button class="btn-cancel" onclick="pauseTimer()">Pause</button>` : `<button class="btn-cancel" onclick="startTimer()">Resume</button>`}
        <button class="btn-save" onclick="finishTimer()">✓ Finish & log</button>
      </div>
      <button class="timer-discard" onclick="resetTimer()">Discard</button>`;
  }
  renderTimerButton();
}

// Light-weight per-second update so inputs don't lose focus
function updateTimerDisplay() {
  renderTimerButton();
  const clock = document.getElementById('timerClockBig');
  if (!clock) return;
  const elapsed = timerElapsedMs();
  const target = timerTargetMs();
  if (timer.mode === 'focus') {
    const remaining = target - elapsed;
    if (remaining <= 0) { completeFocusPhase(); return; }
    clock.textContent = fmtClock(remaining);
  } else {
    clock.textContent = fmtClock(elapsed);
    const line = document.getElementById('timerPaceLine');
    if (line) {
      const shouldBeDone = Math.min(timer.questions, Math.floor(elapsed / (getTargetPace(timer.section) * 1000)));
      line.textContent = elapsed > target
        ? `${fmtClock(elapsed - target)} over the ${fmtClock(target)} target`
        : `Target ${fmtClock(target)} · at test pace you'd be on Q${Math.min(timer.questions, shouldBeDone + 1)}`;
    }
  }
  const fill = document.getElementById('timerBarFill');
  if (fill) {
    fill.style.width = Math.min(100, (elapsed / target) * 100) + '%';
    fill.className = timer.mode === 'set' ? (elapsed > target ? 'over' : elapsed > target * 0.9 ? 'near' : '') : '';
  }
}

function renderTimerButton() {
  const btn = document.getElementById('timerBtn');
  if (!btn) return;
  const active = isTimerActive();
  btn.classList.toggle('running', timer.running);
  btn.classList.toggle('paused', active && !timer.running);
  if (!active) { btn.textContent = '⏱'; return; }
  const ms = timer.mode === 'focus' ? timerTargetMs() - timerElapsedMs() : timerElapsedMs();
  btn.textContent = `⏱ ${fmtClock(ms)}`;
}

// ═══════════════════════════════════
// CONTROLS
// ═══════════════════════════════════
function startTimer() {
  if (timer.running) return;
  timer.running = true;
  timer.startedAt = Date.now();
  saveTimer();
  ensureTick();
  renderTimer();
}

function pauseTimer() {
  if (!timer.running) return;
  timer.banked += Date.now() - timer.startedAt;
  timer.running = false;
  saveTimer();
  renderTimer();
}

function resetTimer() {
  timer.running = false; timer.banked = 0; timer.startedAt = 0; timer.phase = 'focus';
  saveTimer();
  renderTimer();
}

function finishTimer() {
  const minutes = Math.max(1, Math.round(timerElapsedMs() / 60000));
  const { section, questions } = timer;
  resetTimer();
  closeTimer();
  openAddSessionModal({ section, total: questions, minutes });
  showToast(`⏱ ${minutes} min recorded — fill in your score`);
}

function completeFocusPhase() {
  const wasFocus = timer.phase === 'focus';
  if (wasFocus) timer.focusDone = (timer.focusDate === todayISO() ? timer.focusDone : 0) + 1;
  timer.focusDate = todayISO();
  timer.phase = wasFocus ? 'break' : 'focus';
  timer.banked = 0;
  timer.startedAt = Date.now();
  timer.running = true;
  saveTimer();
  chime();
  showToast(wasFocus ? `☕ Focus block done — take ${BREAK_MIN}` : '🎯 Break over — back to it');
  renderTimer();
}

// Soft two-note chime via Web Audio (no files needed)
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.55);
    });
  } catch(e) {}
}

function ensureTick() {
  if (timerTick) return;
  timerTick = setInterval(() => {
    if (!timer.running) { clearInterval(timerTick); timerTick = null; renderTimerButton(); return; }
    updateTimerDisplay();
  }, 1000);
}

// Resume ticking after a reload
if (timer.running) ensureTick();
