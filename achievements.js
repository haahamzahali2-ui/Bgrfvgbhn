// ═══════════════════════════════════
// MILESTONES — unlockable badges for the long grind
// ═══════════════════════════════════

function getAchievementContext() {
  const sum = summarizeSessions(db.sessions);
  const streak = getStreak();
  const totals = db.fullLengths.map(getFLTotal);
  const sortedFL = getSortedFLs().map(getFLTotal);
  const reviews = getAllReviewHistory().length;
  const mastered = db.mistakes.filter(m => getMistakeStatus(m) === 'mastered').length;
  const allTopics = getAllTopics().length;
  const reviewedTopics = Object.values(db.contentStatus).filter(v => v >= 2).length;
  const fullyLogged = db.sessions.some(s => (s.total - s.correct) >= 3 && getUnloggedCount(s) === 0);
  const perfect = db.sessions.some(s => s.total >= 10 && s.correct === s.total);
  const pb = sortedFL.some((t, i) => i > 0 && t > Math.max(...sortedFL.slice(0, i)));
  // All four sections practiced within one Monday-start week
  const weeks = {};
  db.sessions.forEach(s => { const w = weekStartISO(s.date); (weeks[w] = weeks[w] || new Set()).add(s.section); });
  const allFour = Object.values(weeks).some(set => set.size === 4);
  return {
    questions: sum.questions, sets: db.sessions.length, longest: streak.longest,
    best: totals.length ? Math.max(...totals) : 0, fls: totals.length,
    mistakes: db.mistakes.length, reviews, mastered, reviewedTopics, allTopics,
    fullyLogged, perfect, pb, allFour
  };
}

const ACHIEVEMENTS = [
  { key: 'first_set',   icon: '🌱', title: 'First Steps',      desc: 'Log your first practice set',          goal: c => [c.sets, 1] },
  { key: 'q100',        icon: '💯', title: 'Century',          desc: 'Answer 100 questions',                 goal: c => [c.questions, 100] },
  { key: 'q500',        icon: '📚', title: 'Grinder',          desc: 'Answer 500 questions',                 goal: c => [c.questions, 500] },
  { key: 'q1000',       icon: '🏔️', title: 'Four Digits',      desc: 'Answer 1,000 questions',               goal: c => [c.questions, 1000] },
  { key: 'q2500',       icon: '🚀', title: 'Question Machine', desc: 'Answer 2,500 questions',               goal: c => [c.questions, 2500] },
  { key: 'q5000',       icon: '👑', title: 'MCAT Royalty',     desc: 'Answer 5,000 questions',               goal: c => [c.questions, 5000] },
  { key: 'streak3',     icon: '🔥', title: 'Warming Up',       desc: 'Study 3 days in a row',                goal: c => [c.longest, 3] },
  { key: 'streak7',     icon: '⚡', title: 'On Fire',          desc: 'Study 7 days in a row',                goal: c => [c.longest, 7] },
  { key: 'streak30',    icon: '☄️', title: 'Unstoppable',      desc: 'Study 30 days in a row',               goal: c => [c.longest, 30] },
  { key: 'all_four',    icon: '🧩', title: 'Full Spectrum',    desc: 'Practice all 4 sections in one week',  goal: c => [c.allFour ? 1 : 0, 1] },
  { key: 'perfect',     icon: '💎', title: 'Flawless',         desc: 'Score 100% on a set of 10+ questions', goal: c => [c.perfect ? 1 : 0, 1] },
  { key: 'first_mk',    icon: '📝', title: 'Honest Look',      desc: 'Log your first mistake',               goal: c => [c.mistakes, 1] },
  { key: 'debrief',     icon: '🎯', title: 'Full Debrief',     desc: 'Log every miss in a set with 3+ misses', goal: c => [c.fullyLogged ? 1 : 0, 1] },
  { key: 'mk50',        icon: '🔍', title: 'Pattern Hunter',   desc: 'Log 50 mistakes',                      goal: c => [c.mistakes, 50] },
  { key: 'rev100',      icon: '🔁', title: 'Repetition',       desc: 'Complete 100 reviews',                 goal: c => [c.reviews, 100] },
  { key: 'mastered10',  icon: '🏅', title: 'Lesson Learned',   desc: 'Master 10 mistakes',                   goal: c => [c.mastered, 10] },
  { key: 'mastered50',  icon: '🎖️', title: 'Bulletproof',      desc: 'Master 50 mistakes',                   goal: c => [c.mastered, 50] },
  { key: 'content50',   icon: '🗺️', title: 'Halfway There',    desc: 'Review half of the content outline',   goal: c => [c.reviewedTopics, Math.ceil(c.allTopics / 2)] },
  { key: 'first_fl',    icon: '🧪', title: 'Test Drive',       desc: 'Take your first full-length',          goal: c => [c.fls, 1] },
  { key: 'pb',          icon: '📈', title: 'Personal Best',    desc: 'Beat a previous full-length score',    goal: c => [c.pb ? 1 : 0, 1] },
  { key: 'fl510',       icon: '⭐', title: '510 Club',         desc: 'Score 510+ on a full-length',          goal: c => [c.best >= 510 ? 1 : 0, 1] },
  { key: 'fl515',       icon: '🌟', title: '515 Club',         desc: 'Score 515+ on a full-length',          goal: c => [c.best >= 515 ? 1 : 0, 1] },
  { key: 'fl520',       icon: '💫', title: '520 Club',         desc: 'Score 520+ on a full-length',          goal: c => [c.best >= 520 ? 1 : 0, 1] }
];

function checkAchievements(silent = false) {
  const ctx = getAchievementContext();
  const fresh = [];
  ACHIEVEMENTS.forEach(a => {
    const [cur, goal] = a.goal(ctx);
    if (cur >= goal && !db.achievements[a.key]) {
      db.achievements[a.key] = todayISO();
      fresh.push(a);
    }
  });
  if (!fresh.length) return;
  saveDB();
  if (silent) return;
  if (fresh.length === 1) showToast(`🏆 Milestone unlocked: ${fresh[0].icon} ${fresh[0].title}`);
  else showToast(`🏆 ${fresh.length} milestones unlocked!`);
  launchConfetti();
}

function renderMilestones() {
  const el = document.getElementById('milestonesGrid');
  if (!el) return;
  const ctx = getAchievementContext();
  const unlocked = ACHIEVEMENTS.filter(a => db.achievements[a.key]).length;
  document.getElementById('milestonesSub').textContent = `${unlocked} of ${ACHIEVEMENTS.length} unlocked`;
  el.innerHTML = ACHIEVEMENTS.map(a => {
    const got = db.achievements[a.key];
    const [cur, goal] = a.goal(ctx);
    const showProgress = !got && goal > 1;
    return `<div class="milestone ${got ? 'got' : 'locked'}" title="${escapeHtml(a.desc)}">
      <div class="milestone-icon">${a.icon}</div>
      <div class="milestone-title">${a.title}</div>
      <div class="milestone-desc">${got ? `Unlocked ${formatDateTiny(got)}` : escapeHtml(a.desc)}</div>
      ${showProgress ? `<div class="milestone-progress"><span style="width:${Math.min(100, pct(cur, goal))}%"></span></div><div class="milestone-count">${Math.min(cur, goal).toLocaleString()} / ${goal.toLocaleString()}</div>` : ''}
    </div>`;
  }).join('');
}
