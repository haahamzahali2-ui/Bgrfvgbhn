// ═══════════════════════════════════
// HOME — today strip, streak, weekly goal, insights, section snapshot,
// activity heatmap, milestones
// ═══════════════════════════════════

// ═══════════════════════════════════
// STREAK + ACTIVITY
// A day counts if you logged a practice set or reviewed a mistake.
// ═══════════════════════════════════
function getActivityByDate() {
  const days = {};
  const touch = d => (days[d] = days[d] || { questions: 0, correct: 0, sets: 0, reviews: 0, mistakes: 0, fl: false });
  db.sessions.forEach(s => { if (!s.date) return; const d = touch(s.date); d.questions += Number(s.total) || 0; d.correct += Number(s.correct) || 0; d.sets++; });
  db.mistakes.forEach(m => {
    if (m.date) touch(m.date).mistakes++;
    (m.review?.history || []).forEach(h => { touch(h.date).reviews++; });
  });
  db.fullLengths.forEach(f => { if (f.date) touch(f.date).fl = true; });
  return days;
}

function isActiveDay(a) { return !!a && (a.sets > 0 || a.reviews > 0 || a.fl); }

function getStreak() {
  const days = getActivityByDate();
  const today = todayISO();
  const practicedToday = isActiveDay(days[today]);
  let current = 0;
  let cursor = practicedToday ? today : addDaysISO(today, -1);
  while (isActiveDay(days[cursor])) { current++; cursor = addDaysISO(cursor, -1); }

  const active = Object.keys(days).filter(d => isActiveDay(days[d])).sort();
  let longest = 0, run = 0, prev = null;
  active.forEach(d => {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  });
  return { current, longest, practicedToday, activeDays: active.length };
}

function getWeekProgress() {
  const start = weekStartISO(todayISO());
  const sets = db.sessions.filter(s => s.date >= start && s.date <= todayISO());
  const done = sets.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const d = addDaysISO(start, i);
    return { date: d, q: sets.filter(s => s.date === d).reduce((a, s) => a + (Number(s.total) || 0), 0) };
  });
  return { done, goal: Number(db.settings.weeklyGoal) || 300, perDay };
}

// ═══════════════════════════════════
// RENDER
// ═══════════════════════════════════
function renderHome() {
  renderTopbarStats();
  renderCountdown();
  const sum = summarizeSessions(db.sessions);
  const outlook = computeScoreOutlook();
  const week = summarizeSessions(db.sessions.filter(s => s.date >= addDaysISO(todayISO(), -6)));
  document.getElementById('homeStats').innerHTML = `
    <div class="home-stat"><b>${sum.questions.toLocaleString()}</b><span>questions done</span></div>
    <div class="home-stat"><b class="${sum.questions ? getAccuracyClass(sum.accuracy) : ''}">${sum.questions ? sum.accuracy + '%' : '—'}</b><span>accuracy${week.questions ? ` · ${week.accuracy}% this week` : ''}</span></div>
    <div class="home-stat" onclick="showGroup('exams')"><b>${outlook ? outlook.predicted : '—'}</b><span>${outlook ? `predicted score · ~${ordinal(outlook.percentile)} pct` : 'add an exam to predict'}</span></div>`;
  const recent = [...db.sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4);
  document.getElementById('homeRecent').innerHTML = recent.length
    ? recent.map(entryCardHtml).join('')
    : `<div class="home-empty">No passages yet. Hit <b>Log a passage</b> after your next one — or <a href="#" onclick="loadSampleData();return false;">try sample data</a>.</div>`;
  document.getElementById('homeInsights').innerHTML = insightsHtml(generateInsights().slice(0, 3));
}

function renderCountdown() {
  const days = getDaysUntilTest();
  const el = document.getElementById('homeCountdown');
  if (!el) return;
  if (days === null) el.innerHTML = `<a href="#" onclick="openSettingsModal();return false;">Set your test date</a> to start the countdown`;
  else if (days > 0) el.innerHTML = `<strong>${days}</strong> day${days !== 1 ? 's' : ''} until test day`;
  else if (days === 0) el.textContent = 'Test day is today. You\'ve got this. 🩺';
  else el.textContent = `Test taken ${formatDateShort(db.settings.testDate)} — update your date in settings`;
}

function ringSvg(fraction, color, size = 92, stroke = 9) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--cream)" stroke-width="${stroke}" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-progress"/>
  </svg>`;
}

function renderTodayStrip() {
  const el = document.getElementById('todayStrip');
  const { current, longest, practicedToday } = getStreak();
  const { done, goal, perDay } = getWeekProgress();
  const due = getDueMistakes().length;
  const reviewedToday = getReviewsOnDate(todayISO());
  const reviewGoal = db.settings.dailyReviewGoal || 20;
  const outlook = computeScoreOutlook();
  const maxDay = Math.max(1, ...perDay.map(d => d.q));
  const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  el.innerHTML = `
    <div class="today-card streak ${practicedToday ? 'lit' : ''}">
      <div class="today-label">Study Streak</div>
      <div class="streak-flame">${current ? '🔥' : '🪵'}</div>
      <div class="today-big">${current}<span> day${current !== 1 ? 's' : ''}</span></div>
      <div class="today-sub">${practicedToday ? 'Today counted ✓' : current ? 'Study today to keep it alive' : 'Start a streak today'} · best ${longest}</div>
    </div>
    <div class="today-card week" onclick="showPage('practice-list')">
      <div class="today-label">This Week</div>
      <div class="week-ring-wrap">
        ${ringSvg(done / goal, done >= goal ? 'var(--alert-green)' : 'var(--gold)')}
        <div class="week-ring-center"><div class="week-ring-val">${pct(done, goal)}%</div><div class="week-ring-sub">of goal</div></div>
      </div>
      <div class="today-sub">${done.toLocaleString()} / ${goal.toLocaleString()} questions</div>
      <div class="week-bars">${perDay.map((d, i) => `<div class="week-bar ${d.date === todayISO() ? 'today' : ''}" title="${formatDateTiny(d.date)}: ${d.q} Qs"><span style="height:${(d.q / maxDay) * 100}%"></span><em>${dayLetters[i]}</em></div>`).join('')}</div>
    </div>
    <div class="today-card review ${due ? 'has-due' : ''}" onclick="startReview('due')">
      <div class="today-label">Review Queue</div>
      <div class="today-big">${due}<span> due</span></div>
      <div class="kpi-meter"><span style="width:${Math.min(100, pct(reviewedToday, reviewGoal))}%"></span></div>
      <div class="today-sub">${reviewedToday} / ${reviewGoal} reviewed today</div>
      <button class="today-btn">${due ? 'Start review →' : 'All caught up ✓'}</button>
    </div>
    <div class="today-card outlook" onclick="showPage('fl-list')">
      <div class="today-label">Score Outlook</div>
      ${outlook ? `
        <div class="today-big">${outlook.predicted}<span> ±${outlook.range}</span></div>
        <div class="today-sub">≈ ${ordinal(outlook.percentile)} percentile${outlook.projected ? ` · trending to <strong>${outlook.projected}</strong> by test day` : ''}</div>
        ${outlook.target ? `<div class="outlook-gap ${outlook.predicted >= outlook.target ? 'met' : ''}">${outlook.predicted >= outlook.target ? `🎯 At or above your ${outlook.target} target` : `${outlook.target - outlook.predicted} pts to your ${outlook.target} target`}</div>` : ''}
      ` : `<div class="today-big muted">—</div><div class="today-sub">Log a full-length to see your predicted score and percentile</div>`}
    </div>`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderTrackerBadges() {
  const set = (id, text, hot) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? 'inline-flex' : 'none';
    el.classList.toggle('hot', !!hot);
  };
  const unlogged = getTotalUnlogged();
  const due = getDueMistakes().length;
  const weekSets = db.sessions.filter(s => s.date >= weekStartISO(todayISO())).length;
  const confident = Object.values(db.contentStatus).filter(v => v === 3).length;
  set('badge-practice', weekSets ? `${weekSets} this week` : '');
  set('badge-mistakes', unlogged ? `${unlogged} unlogged` : db.mistakes.length ? `${db.mistakes.length} logged` : '', unlogged > 0);
  set('badge-review', due ? `${due} due` : db.mistakes.length ? 'caught up' : '', due > 0);
  set('badge-fl', db.fullLengths.length ? `${db.fullLengths.length} taken` : '');
  set('badge-analytics', '');
  set('badge-content', `${confident}/${getAllTopics().length} confident`);
}

// One card per MCAT section — practice accuracy, mistakes, latest FL section score
function renderSectionSnapshot() {
  const row = document.getElementById('sectionSnapshotRow');
  if (!row) return;
  const latestFL = getSortedFLs().slice(-1)[0];
  row.innerHTML = SECTIONS.map(sec => {
    const sets = db.sessions.filter(s => s.section === sec.key);
    const sum = summarizeSessions(sets);
    const accClass = sum.questions ? getAccuracyClass(sum.accuracy) : '';
    const ms = db.mistakes.filter(m => m.section === sec.key);
    const byB = countBy(ms, m => getErrorType(m.errorType).bucket);
    const topB = Object.keys(byB).sort((a, b) => byB[b] - byB[a])[0];
    // Last-14-day sparkline of daily accuracy
    const spark = Array.from({ length: 14 }, (_, i) => {
      const d = addDaysISO(todayISO(), i - 13);
      const day = summarizeSessions(sets.filter(s => s.date === d));
      return day.questions ? day.accuracy : null;
    });
    return `<div class="snapshot-card" style="--sec-color:${sec.color}" onclick="openAnalyticsFor('section','${sec.short}')">
      <div class="snapshot-card-top">
        <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>
        <span class="snapshot-card-fl">${latestFL ? `FL ${escapeHtml(latestFL[sec.key])}` : ''}</span>
      </div>
      <div class="snapshot-card-name">${sec.name}</div>
      <div class="snapshot-card-val ${accClass}">${sum.questions ? sum.accuracy + '%' : '—'}</div>
      ${sparklineSvg(spark, sec.color)}
      <div class="snapshot-card-sub">${sum.questions.toLocaleString()} Qs · ${plural(ms.length, 'mistake')}</div>
      ${topB ? `<div class="snapshot-card-bucket" style="--bucket-color:${getBucket(topB).color}">Mostly ${getBucket(topB).label.toLowerCase()} errors</div>` : ''}
    </div>`;
  }).join('');
}

function sparklineSvg(values, color, w = 160, h = 34) {
  const present = values.filter(v => v !== null);
  const lo = Math.min(...present) - 4, hi = Math.max(...present) + 4;
  const pts = values.map((v, i) => v === null ? null : [i * (w / (values.length - 1)), h - 3 - ((v - lo) / Math.max(1, hi - lo)) * (h - 6)]);
  const valid = pts.filter(Boolean);
  if (valid.length < 2) return `<div class="sparkline-empty">not enough recent data</div>`;
  const d = valid.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${Math.max(2, Math.min(h - 2, p[1])).toFixed(1)}`).join(' ');
  const last = valid[valid.length - 1];
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${Math.max(2, Math.min(h - 2, last[1]))}" r="2.5" fill="${color}"/>
  </svg>`;
}

// GitHub-style activity calendar — last 26 weeks, with streak stats alongside
function renderHeatmap() {
  const el = document.getElementById('activityHeatmap');
  if (!el) return;
  const days = getActivityByDate();
  const weeks = 26;
  const start = addDaysISO(weekStartISO(todayISO()), -(weeks - 1) * 7);
  const today = todayISO();
  const level = q => q === 0 ? 0 : q < 15 ? 1 : q < 40 ? 2 : q < 80 ? 3 : 4;
  let cells = '', lastMonth = -1;
  ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].forEach((d, i) => { cells += `<span class="hm-daylabel" style="grid-column:1;grid-row:${i + 2}">${d}</span>`; });
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDaysISO(start, w * 7);
    const m = parseLocalDate(weekStart).getMonth();
    if (m !== lastMonth) cells += `<span class="hm-month" style="grid-column:${w + 2} / span 3;grid-row:1">${parseLocalDate(weekStart).toLocaleDateString('en-US', { month: 'short' })}</span>`;
    lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const iso = addDaysISO(weekStart, d);
      const a = days[iso];
      const pos = `grid-column:${w + 2};grid-row:${d + 2}`;
      if (iso > today) { cells += `<div class="hm-cell future" style="${pos}"></div>`; continue; }
      const q = a ? a.questions : 0;
      const lvl = a && !q && a.reviews ? 1 : level(q);
      const title = `${formatDateShort(iso)}: ${q} Qs${a?.sets ? ` in ${plural(a.sets, 'set')}` : ''}${a?.reviews ? ` · ${plural(a.reviews, 'review')}` : ''}${a?.mistakes ? ` · ${plural(a.mistakes, 'mistake')} logged` : ''}${a?.fl ? ' · Full-length 📝' : ''}`;
      cells += `<div class="hm-cell l${lvl} ${a?.fl ? 'fl' : ''} ${iso === today ? 'today' : ''}" style="${pos}" title="${escapeHtml(title)}"></div>`;
    }
  }
  const { current, longest, activeDays } = getStreak();
  const last30 = Array.from({ length: 30 }, (_, i) => addDaysISO(today, -i));
  const active30 = last30.filter(d => isActiveDay(days[d])).length;
  const q30 = last30.reduce((a, d) => a + (days[d]?.questions || 0), 0);
  const r30 = last30.reduce((a, d) => a + (days[d]?.reviews || 0), 0);
  el.innerHTML = `
    <div class="hm-layout">
      <div class="hm-calendar">
        <div class="hm-grid" style="grid-template-columns:30px repeat(${weeks}, 1fr)">${cells}</div>
        <div class="hm-legend">Less <i class="hm-cell l0"></i><i class="hm-cell l1"></i><i class="hm-cell l2"></i><i class="hm-cell l3"></i><i class="hm-cell l4"></i> More <i class="hm-cell l2 fl"></i> Full-length</div>
      </div>
      <div class="hm-side">
        <div class="hm-stat"><b>${current}</b><span>current streak</span></div>
        <div class="hm-stat"><b>${longest}</b><span>longest streak</span></div>
        <div class="hm-stat"><b>${active30}<small>/30</small></b><span>days active this month</span></div>
        <div class="hm-stat"><b>${Math.round(q30 / 30)}</b><span>questions / day (30d avg)</span></div>
        <div class="hm-stat"><b>${r30}</b><span>reviews in 30 days</span></div>
        <div class="hm-stat"><b>${activeDays}</b><span>total study days</span></div>
      </div>
    </div>`;
}
