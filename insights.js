// ═══════════════════════════════════
// INSIGHTS — "What Went Wrong" analytics + the insights engine that turns
// your data into plain-English coaching
// ═══════════════════════════════════

let insightsPeriod = 'all';
let insightsSection = 'all';
let errorTypeChartInst = null, bucketDonutInst = null, bucketBySectionInst = null, mistakesWeeklyInst = null;

function getInsightMistakes() {
  let list = filterSessionsByPeriod(db.mistakes, insightsPeriod);
  if (insightsSection !== 'all') list = list.filter(m => m.section === insightsSection);
  return list;
}

function countBy(list, fn) {
  const out = {};
  list.forEach(x => { const k = fn(x); out[k] = (out[k] || 0) + 1; });
  return out;
}

function setInsightsPeriod(p, btn) {
  insightsPeriod = p;
  document.querySelectorAll('#page-mistake-insights .time-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMistakeInsights();
}

function setInsightsSection(sec, btn) {
  insightsSection = sec;
  setActiveChip(btn);
  renderMistakeInsights();
}

// ═══════════════════════════════════
// PAGE
// ═══════════════════════════════════
function renderMistakeInsights() {
  renderTopbarStats();
  const list = getInsightMistakes();
  const empty = document.getElementById('insightsEmpty');
  const body = document.getElementById('insightsBody');
  renderInsightsList();
  if (!list.length) {
    empty.style.display = 'block'; body.style.display = 'none';
    document.getElementById('insightKPIs').innerHTML = '';
    return;
  }
  empty.style.display = 'none'; body.style.display = 'block';

  const byType = countBy(list, m => m.errorType);
  const byBucket = countBy(list, m => getErrorType(m.errorType).bucket);
  const topType = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0];
  const avoidable = list.filter(m => AVOIDABLE_BUCKETS.includes(getErrorType(m.errorType).bucket)).length;
  const mastered = list.filter(m => getMistakeStatus(m) === 'mastered').length;

  document.getElementById('insightKPIs').innerHTML = `
    <div class="analytics-kpi gold">
      <div class="kpi-val gold">${list.length}</div>
      <div class="kpi-label">Mistakes Logged</div>
      <div class="kpi-sub">${plural(new Set(list.map(m => (m.concept || '').toLowerCase()).filter(Boolean)).size, 'concept')}</div>
    </div>
    <div class="analytics-kpi red">
      <div class="kpi-val red kpi-val-sm">${getErrorType(topType).icon} ${pct(byType[topType], list.length)}%</div>
      <div class="kpi-label">Top Error</div>
      <div class="kpi-sub">${escapeHtml(getErrorType(topType).label)}</div>
    </div>
    <div class="analytics-kpi amber">
      <div class="kpi-val amber">${pct(avoidable, list.length)}%</div>
      <div class="kpi-label">Avoidable</div>
      <div class="kpi-sub">execution + strategy + timing</div>
    </div>
    <div class="analytics-kpi green">
      <div class="kpi-val green">${pct(mastered, list.length)}%</div>
      <div class="kpi-label">Mastered</div>
      <div class="kpi-sub">${mastered} of ${list.length} reviewed to mastery</div>
    </div>`;

  renderPlaybook(list, byType);
  renderErrorTypeChart(list, byType);
  renderBucketDonut(list, byBucket);
  renderBucketBySection(list);
  renderMistakesWeekly(list);
  renderProviderHeatmap(list);
  renderRepeatOffenders(list);
}

// Top 3 error types with their fix
function renderPlaybook(list, byType) {
  const top = Object.keys(byType).sort((a, b) => byType[b] - byType[a]).slice(0, 3);
  document.getElementById('playbookCards').innerHTML = top.map((k, i) => {
    const et = getErrorType(k);
    const b = getBucket(et.bucket);
    return `<div class="playbook-card" style="--bucket-color:${b.color}">
      <div class="playbook-rank">#${i + 1}</div>
      <div class="playbook-title">${et.icon} ${escapeHtml(et.label)}</div>
      <div class="playbook-stat">${byType[k]} mistakes · ${pct(byType[k], list.length)}% of your misses · <span style="color:${b.color}">${b.label}</span></div>
      <div class="playbook-tip">${escapeHtml(et.tip)}</div>
      <button class="filter-clear-btn" onclick="openMistakesFiltered({ errorType: '${k}' })">See these ${byType[k]} →</button>
    </div>`;
  }).join('');
}

function renderErrorTypeChart(list, byType) {
  const canvas = document.getElementById('errorTypeChart');
  const container = document.getElementById('errorTypeContainer');
  if (errorTypeChartInst) errorTypeChartInst.destroy();
  const keys = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
  container.style.height = Math.max(240, keys.length * 34 + 40) + 'px';
  errorTypeChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: keys.map(k => `${getErrorType(k).icon} ${getErrorType(k).label}`),
      datasets: [{ data: keys.map(k => byType[k]), backgroundColor: keys.map(k => hexToRgba(getBucket(getErrorType(k).bucket).color, 0.78)), borderRadius: 6, maxBarThickness: 24 }]
    },
    options: mergeOptions(getChartDefaults(), {
      indexAxis: 'y',
      onClick: (evt, els) => { if (els.length) openMistakesFiltered({ errorType: keys[els[0].index] }); },
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} mistakes · ${pct(ctx.parsed.x, list.length)}%` } } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { font: { size: 12 } } } }
    })
  });
}

function renderBucketDonut(list, byBucket) {
  const canvas = document.getElementById('bucketDonutChart');
  if (bucketDonutInst) bucketDonutInst.destroy();
  const buckets = ERROR_BUCKETS.filter(b => byBucket[b.key]);
  bucketDonutInst = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ data: buckets.map(b => byBucket[b.key]), backgroundColor: buckets.map(b => b.color), borderColor: isDarkMode() ? '#1E1A12' : '#FFFDF7', borderWidth: 3 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '64%',
      onClick: (evt, els) => { if (els.length) openMistakesFiltered({ bucket: buckets[els[0].index].key }); },
      plugins: {
        legend: { display: false },
        tooltip: getChartDefaults().plugins.tooltip
      }
    }
  });
  document.getElementById('bucketLegend').innerHTML = buckets.map(b => `
    <div class="bucket-legend-row" onclick="openMistakesFiltered({ bucket: '${b.key}' })">
      <span class="bucket-dot" style="background:${b.color}"></span>
      <div><div class="bucket-legend-name">${b.label} <span>${pct(byBucket[b.key], list.length)}%</span></div>
      <div class="bucket-legend-blurb">${escapeHtml(b.blurb)} <em>Fix: ${escapeHtml(b.fix)}</em></div></div>
    </div>`).join('');
}

function renderBucketBySection(list) {
  const canvas = document.getElementById('bucketBySectionChart');
  if (bucketBySectionInst) bucketBySectionInst.destroy();
  const secs = SECTIONS.filter(sec => list.some(m => m.section === sec.key));
  const totals = secs.map(sec => list.filter(m => m.section === sec.key).length);
  bucketBySectionInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: secs.map(sec => sec.short),
      datasets: ERROR_BUCKETS.map(b => ({
        label: b.label,
        data: secs.map((sec, i) => pct(list.filter(m => m.section === sec.key && getErrorType(m.errorType).bucket === b.key).length, totals[i])),
        backgroundColor: hexToRgba(b.color, 0.8), borderRadius: 3, maxBarThickness: 34
      })).filter(ds => ds.data.some(v => v > 0))
    },
    options: mergeOptions(getChartDefaults(), {
      indexAxis: 'y',
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x}%` } } },
      scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }, y: { stacked: true } }
    })
  });
}

function renderMistakesWeekly(list) {
  const canvas = document.getElementById('mistakesWeeklyChart');
  if (mistakesWeeklyInst) mistakesWeeklyInst.destroy();
  const weeks = getWeekRange(list);
  mistakesWeeklyInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: weeks.map(w => `Wk of ${formatWeekLabel(w)}`),
      datasets: ERROR_BUCKETS.map(b => ({
        label: b.label,
        data: weeks.map(w => list.filter(m => weekStartISO(m.date) === w && getErrorType(m.errorType).bucket === b.key).length),
        backgroundColor: hexToRgba(b.color, 0.8), borderRadius: 3
      })).filter(ds => ds.data.some(v => v > 0))
    },
    options: mergeOptions(getChartDefaults(), {
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
    })
  });
}

// Provider × root cause — which sources expose which weaknesses
function renderProviderHeatmap(list) {
  const el = document.getElementById('providerHeatmap');
  const byProv = {};
  list.forEach(m => { const p = m.provider || 'Unspecified'; (byProv[p] = byProv[p] || []).push(m); });
  const provs = Object.keys(byProv).sort((a, b) => byProv[b].length - byProv[a].length);
  const buckets = ERROR_BUCKETS.filter(b => list.some(m => getErrorType(m.errorType).bucket === b.key));
  el.innerHTML = `<table class="heatmap-table">
    <thead><tr><th>Provider</th><th>Mistakes</th>${buckets.map(b => `<th><span class="bucket-dot" style="background:${b.color}"></span>${b.label}</th>`).join('')}</tr></thead>
    <tbody>${provs.map(p => {
      const rows = byProv[p];
      return `<tr><td><strong>${escapeHtml(p)}</strong></td><td>${rows.length}</td>${buckets.map(b => {
        const n = rows.filter(m => getErrorType(m.errorType).bucket === b.key).length;
        const share = pct(n, rows.length);
        return `<td class="heat-cell" style="background:${hexToRgba(b.color, Math.min(0.85, share / 100 * 1.4))};color:${share > 45 ? '#fff' : 'inherit'}"
          onclick="openMistakesFiltered({ provider: ${jsArg(p)}, bucket: '${b.key}' })" title="${n} of ${rows.length}">${n ? share + '%' : '—'}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table>`;
}

function getRepeatOffenders(list) {
  const groups = {};
  list.forEach(m => {
    const k = (m.concept || '').trim().toLowerCase();
    if (!k) return;
    (groups[k] = groups[k] || []).push(m);
  });
  return Object.values(groups).map(ms => {
    const types = countBy(ms, m => m.errorType);
    const topType = Object.keys(types).sort((a, b) => types[b] - types[a])[0];
    const subjects = countBy(ms, m => m.subject || '—');
    return {
      concept: ms[0].concept.trim(),
      subject: Object.keys(subjects).sort((a, b) => subjects[b] - subjects[a])[0],
      section: ms[0].section,
      count: ms.length, topType,
      last: ms.map(m => m.date).sort().pop(),
      mastered: ms.filter(m => getMistakeStatus(m) === 'mastered').length
    };
  }).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

function renderRepeatOffenders(list) {
  const rows = getRepeatOffenders(list).filter(r => r.count >= 2).slice(0, 12);
  const tbody = document.querySelector('#repeatTable tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No concept missed twice yet — add a concept to each mistake to spot patterns.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const sec = getSection(r.section);
    const et = getErrorType(r.topType);
    return `<tr onclick="openMistakesFiltered({ concept: ${jsArg(r.concept)} })">
      <td><strong>${escapeHtml(r.concept)}</strong></td>
      <td><span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span> ${escapeHtml(r.subject)}</td>
      <td><span class="repeat-count ${r.count >= 4 ? 'hot' : ''}">× ${r.count}</span></td>
      <td><span class="error-chip" style="--bucket-color:${getBucket(et.bucket).color}">${et.icon} ${escapeHtml(et.label)}</span></td>
      <td>${relativeDay(r.last)}</td>
      <td>${r.mastered}/${r.count}</td>
    </tr>`;
  }).join('');
}

function renderInsightsList() {
  const el = document.getElementById('insightsFullList');
  if (el) el.innerHTML = insightsHtml(generateInsights());
}

// ═══════════════════════════════════
// INSIGHTS ENGINE
// Each rule returns { pri, tone, icon, text, action? } — higher pri shows first.
// ═══════════════════════════════════
function sectionAccuracyWindow(sectionKey, fromIso, toIso) {
  return summarizeSessions(db.sessions.filter(s => s.section === sectionKey && s.date >= fromIso && s.date <= toIso));
}

function generateInsights() {
  const out = [];
  const today = todayISO();
  const add = (pri, tone, icon, text, action) => out.push({ pri, tone, icon, text, action });
  const target = Number(db.settings.targetAccuracy) || 75;

  // Reviews due
  const due = getDueMistakes().length;
  if (due) add(95, 'warn', '🔁', `<strong>${plural(due, 'mistake')} due for review.</strong> Spaced review is how a miss turns into a point.`, { label: 'Start review', fn: "startReview('due')" });

  // Unlogged misses
  const unlogged = getTotalUnlogged();
  if (unlogged) add(90, 'warn', '📝', `<strong>${plural(unlogged, 'missed question')} not explained yet.</strong> You can't fix a pattern you haven't written down.`, { label: 'Log them', fn: 'openUnloggedPicker()' });

  // Streak
  if (typeof getStreak === 'function') {
    const { current, practicedToday } = getStreak();
    if (current >= 2 && !practicedToday) add(85, 'warn', '🔥', `<strong>Keep your ${current}-day streak alive</strong> — log a set or clear a few reviews today.`, { label: 'Log practice', fn: 'openLogEditor()' });
    else if (current >= 3) add(30, 'good', '🔥', `<strong>${current}-day streak.</strong> Consistency beats cramming — keep stacking days.`);
  }

  // Section accuracy: weakest + 2-week momentum
  const recentStart = addDaysISO(today, -13), priorStart = addDaysISO(today, -27), priorEnd = addDaysISO(today, -14);
  const secStats = SECTIONS.map(sec => ({ sec, ...summarizeSessions(db.sessions.filter(s => s.section === sec.key)) })).filter(x => x.questions >= 20);
  if (secStats.length >= 2) {
    const weakest = [...secStats].sort((a, b) => a.accuracy - b.accuracy)[0];
    if (weakest.accuracy < target) add(70, 'bad', '🎯', `<strong>${weakest.sec.name} is your weakest section</strong> at ${weakest.accuracy}% (target ${target}%). Put your next few sets here.`, { label: 'Drill in', fn: `openAnalyticsFor('section', '${weakest.sec.short}')` });
  }
  SECTIONS.forEach(sec => {
    const now = sectionAccuracyWindow(sec.key, recentStart, today);
    const before = sectionAccuracyWindow(sec.key, priorStart, priorEnd);
    if (now.questions < 15 || before.questions < 15) return;
    const diff = now.accuracy - before.accuracy;
    if (diff >= 4) add(55 + diff, 'good', '📈', `<strong>${sec.name} is up ${diff} pts</strong> over the last two weeks (${before.accuracy}% → ${now.accuracy}%). Whatever you're doing, keep doing it.`);
    else if (diff <= -4) add(65 - diff, 'bad', '📉', `<strong>${sec.name} dropped ${-diff} pts</strong> in the last two weeks (${before.accuracy}% → ${now.accuracy}%). Check the mistake log for a new pattern.`, { label: 'See mistakes', fn: `openMistakesFiltered({ section: '${sec.short}' })` });
  });

  // Mistake patterns
  const recentMistakes = db.mistakes.filter(m => m.date >= addDaysISO(today, -29));
  const pool = recentMistakes.length >= 8 ? recentMistakes : db.mistakes;
  const windowLabel = pool === recentMistakes ? 'in the last 30 days' : 'overall';
  if (pool.length >= 5) {
    const byType = countBy(pool, m => m.errorType);
    const top = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0];
    const et = getErrorType(top);
    add(75, 'info', et.icon, `<strong>${et.label} is your #1 error</strong> — ${pct(byType[top], pool.length)}% of misses ${windowLabel}. ${escapeHtml(et.tip)}`, { label: 'See them', fn: `openMistakesFiltered({ errorType: '${top}' })` });

    const avoidable = pool.filter(m => AVOIDABLE_BUCKETS.includes(getErrorType(m.errorType).bucket)).length;
    const share = pct(avoidable, pool.length);
    if (share >= 30) add(72, 'warn', '🤦', `<strong>${share}% of your misses are avoidable</strong> (misreads, traps, timing) — you already knew the content. These are the cheapest points on the exam.`, { label: 'Show avoidable', fn: "showPage('mistake-insights')" });

    // Per-section dominant root cause
    SECTIONS.forEach(sec => {
      const ms = pool.filter(m => m.section === sec.key);
      if (ms.length < 5) return;
      const byB = countBy(ms, m => getErrorType(m.errorType).bucket);
      const topB = Object.keys(byB).sort((a, b) => byB[b] - byB[a])[0];
      const sh = pct(byB[topB], ms.length);
      if (sh >= 45) {
        const b = getBucket(topB);
        add(50 + sh / 5, 'info', '🧭', `<strong>In ${sec.name}, ${sh}% of misses are ${b.label} errors.</strong> ${escapeHtml(b.blurb)} Best fix: ${escapeHtml(b.fix.toLowerCase())}.`, { label: 'Filter', fn: `openMistakesFiltered({ section: '${sec.short}', bucket: '${topB}' })` });
      }
    });

    // Guesses inflate accuracy
    const guesses = pool.filter(m => m.errorType === 'guess').length;
    if (guesses >= 4) add(35, 'info', '🍀', `<strong>${plural(guesses, 'lucky guess', 'lucky guesses')} logged ${windowLabel}.</strong> Your accuracy is a little rosier than your mastery — keep reviewing them.`);
  }

  // Repeat concepts
  const repeat = getRepeatOffenders(db.mistakes).find(r => r.count >= 3 && r.mastered < r.count);
  if (repeat) add(68, 'bad', '🔂', `<strong>You've missed "${escapeHtml(repeat.concept)}" ${repeat.count} times.</strong> Time for a focused content review, not more questions.`, { label: 'Review it', fn: `openMistakesFiltered({ concept: ${JSON.stringify(repeat.concept)} })` });

  // Pace
  SECTIONS.forEach(sec => {
    const timed = db.sessions.filter(s => s.section === sec.key && Number(s.minutes) > 0 && s.date >= addDaysISO(today, -29));
    if (timed.length < 3) return;
    const { secPerQ } = summarizeSessions(timed);
    const tgt = getTargetPace(sec.key);
    if (secPerQ > tgt * 1.12) add(48, 'warn', '⏱️', `<strong>${sec.name} pace: ${formatPace(secPerQ)} per question</strong> vs. ${formatPace(tgt)} on test day. Practice timed sets and triage long calculations.`, { label: 'Start timer', fn: `openTimer('${sec.key}')` });
  });

  // Full-lengths
  const fls = getSortedFLs();
  const daysLeft = getDaysUntilTest();
  const lastFL = fls[fls.length - 1];
  if (daysLeft !== null && daysLeft > 0 && daysLeft <= 70) {
    const since = lastFL ? daysBetween(lastFL.date, today) : null;
    if (!lastFL || since > 14) add(60, 'warn', '📝', `<strong>${daysLeft} days to test day${lastFL ? ` and ${since} days since your last full-length` : ' and no full-lengths logged yet'}.</strong> Aim for one FL every 7–10 days from here.`, { label: 'Full-lengths', fn: "showPage('fl-list')" });
  }
  if (lastFL) {
    const weakest = [...SECTIONS].sort((a, b) => Number(lastFL[a.key]) - Number(lastFL[b.key]))[0];
    const strongest = [...SECTIONS].sort((a, b) => Number(lastFL[b.key]) - Number(lastFL[a.key]))[0];
    if (Number(lastFL[strongest.key]) - Number(lastFL[weakest.key]) >= 2) add(45, 'info', '🏋️', `<strong>Biggest lever: ${weakest.name}</strong> (${lastFL[weakest.key]} on your last FL vs. ${lastFL[strongest.key]} in ${strongest.name}). Section points are easier to gain where you're lowest.`);
  }

  // AAMC vs third-party
  const aamc = summarizeSessions(db.sessions.filter(s => s.provider === 'AAMC'));
  const third = summarizeSessions(db.sessions.filter(s => s.provider && s.provider !== 'AAMC'));
  if (aamc.questions >= 30 && third.questions >= 30 && Math.abs(aamc.accuracy - third.accuracy) >= 6) {
    add(32, 'info', '🏛️', aamc.accuracy > third.accuracy
      ? `<strong>You score ${aamc.accuracy - third.accuracy} pts higher on AAMC</strong> (${aamc.accuracy}%) than third-party material (${third.accuracy}%). Normal — third-party runs harder. AAMC is the better predictor.`
      : `<strong>Your AAMC accuracy (${aamc.accuracy}%) trails third-party (${third.accuracy}%).</strong> AAMC logic is its own skill — prioritize AAMC material and review its reasoning closely.`);
  }

  // Weekly goal
  if (typeof getWeekProgress === 'function') {
    const { done, goal } = getWeekProgress();
    if (done >= goal) add(40, 'good', '🏆', `<strong>Weekly goal smashed:</strong> ${done.toLocaleString()} / ${goal.toLocaleString()} questions this week.`);
  }

  // Backup reminder
  const lastBackup = localStorage.getItem('mcat_last_backup');
  const totalItems = db.sessions.length + db.mistakes.length;
  if (totalItems >= 25 && (!lastBackup || daysBetween(lastBackup, today) > 14)) add(25, 'info', '💾', `<strong>${lastBackup ? `Last backup was ${relativeDay(lastBackup)}.` : 'You haven\'t backed up yet.'}</strong> Your data only lives in this browser.`, { label: 'Back up', fn: 'exportBackupJSON()' });

  if (!out.length) add(10, 'info', '👋', db.sessions.length
    ? '<strong>Keep logging.</strong> Insights get sharper with every set and every mistake you record.'
    : '<strong>Welcome!</strong> Log your first practice set — or load sample data in ⚙️ Settings to see what this dashboard can do.',
    db.sessions.length ? null : { label: 'Log practice', fn: 'openLogEditor()' });

  return out.sort((a, b) => b.pri - a.pri);
}

function insightsHtml(list) {
  return list.map(i => `
    <div class="insight-row ${i.tone}">
      <div class="insight-icon">${i.icon}</div>
      <div class="insight-text">${i.text}</div>
      ${i.action ? `<button class="insight-action" onclick="${escapeHtml(i.action.fn)}">${i.action.label} →</button>` : ''}
    </div>`).join('');
}

// ═══════════════════════════════════
// ERROR BREAKDOWN for any slice (used in analytics drill-downs)
// ═══════════════════════════════════
function errorBreakdownHtml(mistakes, drill) {
  if (!mistakes.length) return `<div class="table-empty" style="padding:18px">No mistakes logged here yet. Log what went wrong after your sets to see patterns.</div>`;
  const byType = countBy(mistakes, m => m.errorType);
  const keys = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
  const max = byType[keys[0]];
  return keys.map(k => {
    const et = getErrorType(k);
    const b = getBucket(et.bucket);
    return `<div class="eb-row" onclick="openMistakesFiltered({ ...${escapeHtml(JSON.stringify(drill))}, errorType: '${k}' })">
      <div class="eb-label">${et.icon} ${escapeHtml(et.label)}</div>
      <div class="eb-bar"><span style="width:${(byType[k] / max) * 100}%;background:${b.color}"></span></div>
      <div class="eb-val">${byType[k]} <span>${pct(byType[k], mistakes.length)}%</span></div>
    </div>`;
  }).join('');
}
