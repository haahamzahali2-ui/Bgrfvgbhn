// ═══════════════════════════════════
// REVIEW QUEUE — spaced repetition for your mistakes (SM-2 style)
// Again → tomorrow · Hard → a bit longer · Good → interval × ease · Easy → longer still
// An item is "mastered" once its interval reaches 21+ days.
// ═══════════════════════════════════

const GRADES = [
  { val: 1, key: 'again', label: 'Again', hint: 'Still got it wrong' },
  { val: 2, key: 'hard',  label: 'Hard',  hint: 'Got it, with effort' },
  { val: 3, key: 'good',  label: 'Good',  hint: 'Knew it' },
  { val: 4, key: 'easy',  label: 'Easy',  hint: 'Instant' }
];
const MASTERED_INTERVAL = 21;

let reviewQueue = [];
let reviewIndex = 0;
let reviewRevealed = false;
let reviewSessionStats = { done: 0, again: 0 };
let reviewMode = 'due'; // 'due' | 'ahead'
let reviewScope = { section: 'all' };
let reviewForecastChartInst = null;

// Pure scheduling — returns the next { interval, ease } without mutating
function computeNextReview(r, grade) {
  let interval = r.interval || 0;
  let ease = r.ease || 2.5;
  if (grade === 1) {
    interval = 1; ease = Math.max(1.3, ease - 0.2);
  } else if (grade === 2) {
    interval = r.reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
    ease = Math.max(1.3, ease - 0.15);
  } else if (grade === 3) {
    interval = r.reps === 0 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
  } else {
    interval = r.reps === 0 ? 6 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
    ease = ease + 0.15;
  }
  return { interval: Math.min(interval, 365), ease: Math.round(ease * 100) / 100 };
}

function formatInterval(days) {
  if (days < 1) return '<1d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return '1y';
}

function applyReview(m, grade) {
  const r = m.review;
  const next = computeNextReview(r, grade);
  r.interval = next.interval;
  r.ease = next.ease;
  r.reps += 1;
  if (grade === 1) r.lapses += 1;
  r.due = addDaysISO(todayISO(), next.interval);
  r.last = todayISO();
  r.history.push({ date: todayISO(), grade });
}

function getDueMistakes() {
  const today = todayISO();
  return db.mistakes.filter(m => (m.review?.due || '') <= today);
}

function getReviewsOnDate(iso) {
  let n = 0;
  db.mistakes.forEach(m => (m.review?.history || []).forEach(h => { if (h.date === iso) n++; }));
  return n;
}

function getAllReviewHistory() {
  const out = [];
  db.mistakes.forEach(m => (m.review?.history || []).forEach(h => out.push(h)));
  return out;
}

// Share of reviews in the last 30 days that weren't "Again"
function getRetentionRate() {
  const since = addDaysISO(todayISO(), -29);
  const recent = getAllReviewHistory().filter(h => h.date >= since);
  if (!recent.length) return null;
  return pct(recent.filter(h => h.grade > 1).length, recent.length);
}

// ═══════════════════════════════════
// QUEUE BUILD
// ═══════════════════════════════════
function buildReviewQueue() {
  let pool;
  if (reviewMode === 'ahead') {
    // Review ahead: the next 20 soonest-due items that aren't due yet
    pool = db.mistakes.filter(m => !isMistakeDue(m))
      .sort((a, b) => a.review.due.localeCompare(b.review.due)).slice(0, 20);
  } else {
    pool = getDueMistakes();
  }
  if (reviewScope.section !== 'all') pool = pool.filter(m => m.section === reviewScope.section);
  // Most overdue first, then the ones you keep lapsing on
  reviewQueue = pool.sort((a, b) =>
    a.review.due.localeCompare(b.review.due) || b.review.lapses - a.review.lapses || (a.createdAt || 0) - (b.createdAt || 0)
  ).map(m => m.id);
  reviewIndex = 0;
  reviewRevealed = false;
}

function startReview(mode = 'due') {
  reviewMode = mode;
  reviewSessionStats = { done: 0, again: 0 };
  buildReviewQueue();
  showPage('review');
}

function setReviewScope(section, btn) {
  reviewScope.section = section;
  setActiveChip(btn);
  buildReviewQueue();
  renderReview();
}

// ═══════════════════════════════════
// RENDER
// ═══════════════════════════════════
function renderReview() {
  renderTopbarStats();
  const due = getDueMistakes().length;
  const today = getReviewsOnDate(todayISO());
  const goal = db.settings.dailyReviewGoal || 20;
  const retention = getRetentionRate();
  const mastered = db.mistakes.filter(m => getMistakeStatus(m) === 'mastered').length;

  document.getElementById('reviewCountLabel').textContent =
    `${due} due · ${plural(db.mistakes.length, 'mistake')} in your deck`;
  document.getElementById('reviewKPIs').innerHTML = `
    <div class="analytics-kpi ${due ? 'red' : 'green'}">
      <div class="kpi-val ${due ? 'red' : 'green'}">${due}</div>
      <div class="kpi-label">Due Now</div>
      <div class="kpi-sub">${due ? 'clear these first' : 'all caught up'}</div>
    </div>
    <div class="analytics-kpi gold">
      <div class="kpi-val gold">${today}<span class="kpi-of">/${goal}</span></div>
      <div class="kpi-label">Reviewed Today</div>
      <div class="kpi-meter"><span style="width:${Math.min(100, pct(today, goal))}%"></span></div>
    </div>
    <div class="analytics-kpi green">
      <div class="kpi-val green">${retention === null ? '—' : retention + '%'}</div>
      <div class="kpi-label">Retention</div>
      <div class="kpi-sub">non-"Again" answers, last 30 days</div>
    </div>
    <div class="analytics-kpi amber">
      <div class="kpi-val amber">${mastered}</div>
      <div class="kpi-label">Mastered</div>
      <div class="kpi-sub">interval ≥ ${MASTERED_INTERVAL} days</div>
    </div>`;

  // Drop items that were deleted since the queue was built
  reviewQueue = reviewQueue.filter(id => db.mistakes.some(m => m.id === id));
  if (reviewIndex >= reviewQueue.length && !reviewSessionStats.done) buildReviewQueue();
  if (!reviewQueue.length || reviewIndex >= reviewQueue.length) renderReviewDone();
  else renderReviewCard();
  renderReviewForecast();
}

// Called when navigating to the review page: start a fresh session if the last one finished
function onEnterReview() {
  if (reviewIndex >= reviewQueue.length) {
    reviewMode = 'due';
    reviewSessionStats = { done: 0, again: 0 };
    buildReviewQueue();
  }
}

function renderReviewCard() {
  const m = db.mistakes.find(x => x.id === reviewQueue[reviewIndex]);
  const stage = document.getElementById('reviewStage');
  if (!m) { renderReviewDone(); return; }
  const sec = getSection(m.section);
  const et = getErrorType(m.errorType);
  const b = getBucket(et.bucket);
  const r = m.review;
  const progress = pct(reviewIndex, reviewQueue.length);
  const overdue = -daysBetween(todayISO(), r.due);

  stage.innerHTML = `
    <div class="review-progress">
      <div class="review-progress-bar"><span style="width:${progress}%"></span></div>
      <div class="review-progress-label">${reviewIndex + 1} of ${reviewQueue.length}${reviewMode === 'ahead' ? ' · reviewing ahead' : ''}${reviewSessionStats.done ? ` · ${reviewSessionStats.done} done this session` : ''}</div>
    </div>
    <div class="flashcard ${reviewRevealed ? 'revealed' : ''}" style="--bucket-color:${b.color}">
      <div class="flashcard-top">
        <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>
        <span class="flashcard-subject">${escapeHtml(m.subject)}${m.provider ? ` · ${escapeHtml(m.provider)}` : ''}${m.questionRef ? ` · ${escapeHtml(m.questionRef)}` : ''}</span>
        <span class="flashcard-meta">${r.reps ? `${plural(r.reps, 'review')}${r.lapses ? ` · ${plural(r.lapses, 'lapse')}` : ''}` : 'first review'}${overdue > 0 ? ` · ${overdue}d overdue` : ''}</span>
      </div>
      <div class="flashcard-concept">${escapeHtml(m.concept) || escapeHtml(m.subject)}</div>
      <div class="flashcard-question">${m.question ? escapeHtml(m.question) : '<span class="muted">Before you reveal: what\'s the key rule for this concept, and what trap did you fall into last time?</span>'}</div>
      ${reviewRevealed ? `
        <div class="flashcard-answer">
          <div class="flashcard-error">${errorChipHtml(m)}${m.myAnswer && m.correctAnswer ? `<span class="answer-flip">You picked ${escapeHtml(m.myAnswer)} · correct ${escapeHtml(m.correctAnswer)}</span>` : ''}</div>
          ${m.what ? `<div class="flashcard-block"><div class="mistake-label">What went wrong</div>${escapeHtml(m.what)}</div>` : ''}
          ${(() => { const u = m.link || getSessionLinks(db.sessions.find(x => x.id === m.sessionId))[0]; return u ? `<div>${linkChipHtml(u, m.link ? 'Open the original question' : 'Open the passage')}</div>` : ''; })()}
          ${m.takeaway ? `<div class="flashcard-block takeaway"><div class="mistake-label">Takeaway</div>💡 ${escapeHtml(m.takeaway)}</div>` : ''}
          <div class="flashcard-block tip"><div class="mistake-label">Strategy for ${escapeHtml(et.label.toLowerCase())}</div>${escapeHtml(et.tip)}</div>
        </div>
        <div class="grade-row">
          ${GRADES.map(g => `<button class="grade-btn ${g.key}" onclick="gradeReview(${g.val})">
            <span class="grade-label">${g.label}</span>
            <span class="grade-interval">${formatInterval(computeNextReview(r, g.val).interval)}</span>
            <kbd>${g.val}</kbd>
          </button>`).join('')}
        </div>` : `
        <button class="reveal-btn" onclick="revealReview()">Show Answer <kbd>Space</kbd></button>`}
      <div class="flashcard-tools">
        <button class="filter-clear-btn" onclick="openEditMistakeModal(${jsArg(m.id)})">✏️ Edit</button>
        <button class="filter-clear-btn" onclick="skipReview()">Skip ›</button>
        <button class="filter-clear-btn" onclick="masterReview()">✓ Mark mastered</button>
      </div>
    </div>`;
}

function renderReviewDone() {
  const stage = document.getElementById('reviewStage');
  const ahead = db.mistakes.filter(m => !isMistakeDue(m)).length;
  const next = db.mistakes.filter(m => !isMistakeDue(m)).map(m => m.review.due).sort()[0];
  const { done, again } = reviewSessionStats;
  stage.innerHTML = `
    <div class="review-done">
      <div class="review-done-icon">${done ? '🎉' : db.mistakes.length ? '✨' : '🗂️'}</div>
      <div class="review-done-title">${done ? 'Session complete!' : db.mistakes.length ? 'All caught up' : 'No cards yet'}</div>
      <div class="review-done-sub">${done
        ? `You reviewed ${plural(done, 'card')} — ${pct(done - again, done)}% recalled. ${again ? `${plural(again, 'card')} will come back tomorrow.` : 'Clean sweep.'}`
        : db.mistakes.length
          ? `Nothing is due. ${next ? `Next card is due ${relativeDay(next)}.` : ''}`
          : 'Every mistake you log becomes a review card here, scheduled right before you\'d forget it.'}</div>
      <div class="review-done-actions">
        ${ahead ? `<button class="analytics-export-btn" onclick="startReview('ahead')">Review ahead (${Math.min(20, ahead)})</button>` : ''}
        ${db.mistakes.length ? '' : `<button class="btn-save" onclick="openLogEditor()">Log a passage</button>`}
        <button class="confetti-btn" onclick="showPage('mistakes')">Open journal</button>
      </div>
    </div>`;
}

// Next 14 days of due cards
function renderReviewForecast() {
  const canvas = document.getElementById('reviewForecastChart');
  if (!canvas) return;
  if (reviewForecastChartInst) reviewForecastChartInst.destroy();
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i));
  const counts = days.map((d, i) => db.mistakes.filter(m => i === 0 ? m.review.due <= d : m.review.due === d).length);
  reviewForecastChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: days.map((d, i) => i === 0 ? 'Today' : formatDateTiny(d)),
      datasets: [{ label: 'Cards due', data: counts, backgroundColor: counts.map((_, i) => i === 0 ? 'rgba(192,57,43,0.75)' : 'rgba(201,168,76,0.6)'), borderRadius: 6, maxBarThickness: 28 }]
    },
    options: mergeOptions(getChartDefaults(), {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    })
  });
}

// ═══════════════════════════════════
// ACTIONS
// ═══════════════════════════════════
function revealReview() {
  reviewRevealed = true;
  renderReviewCard();
}

function gradeReview(grade) {
  const m = db.mistakes.find(x => x.id === reviewQueue[reviewIndex]);
  if (!m || !reviewRevealed) return;
  const wasMastered = getMistakeStatus(m) === 'mastered';
  applyReview(m, grade);
  saveDB();
  reviewSessionStats.done++;
  if (grade === 1) reviewSessionStats.again++;
  if (!wasMastered && getMistakeStatus(m) === 'mastered') showToast(`🏅 Mastered: ${m.concept || m.subject}`);
  reviewIndex++;
  reviewRevealed = false;
  if (reviewIndex >= reviewQueue.length && reviewSessionStats.done >= 3 && !reviewSessionStats.again) launchConfetti();
  if (typeof checkAchievements === 'function') checkAchievements();
  renderReview();
}

function skipReview() {
  // Move to the back of the queue
  const [id] = reviewQueue.splice(reviewIndex, 1);
  reviewQueue.push(id);
  reviewRevealed = false;
  renderReviewCard();
}

function masterReview() {
  const m = db.mistakes.find(x => x.id === reviewQueue[reviewIndex]);
  if (!m) return;
  m.review.interval = Math.max(m.review.interval, MASTERED_INTERVAL);
  m.review.reps += 1;
  m.review.due = addDaysISO(todayISO(), m.review.interval);
  m.review.history.push({ date: todayISO(), grade: 4 });
  saveDB();
  reviewSessionStats.done++;
  reviewIndex++;
  reviewRevealed = false;
  showToast(`🏅 Marked mastered — next check ${relativeDay(m.review.due)}`);
  renderReview();
}

// Keyboard: Space reveals, 1–4 grades
document.addEventListener('keydown', e => {
  if (!document.getElementById('page-review')?.classList.contains('active')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (document.querySelector('.modal-overlay.open') || document.getElementById('paletteOverlay')?.classList.contains('open')) return;
  if (e.key === ' ' && !reviewRevealed && reviewQueue.length && reviewIndex < reviewQueue.length) { e.preventDefault(); revealReview(); }
  else if (reviewRevealed && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); gradeReview(Number(e.key)); }
});
