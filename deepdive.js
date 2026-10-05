// ═══════════════════════════════════
// DEEP DIVE — the analytics behind the analytics:
// momentum, pacing, fatigue, weekday rhythm, answer bias, score spread,
// provider × section, plus auto-written findings
// ═══════════════════════════════════

let ddPeriod = 'all';
let ddSection = 'all';
const ddCharts = {};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LENGTH_BUCKETS = [[1, 6, '1–6 Qs'], [7, 12, '7–12 Qs'], [13, 20, '13–20 Qs'], [21, 40, '21–40 Qs'], [41, 999, '41+ Qs']];

function setDDPeriod(p, btn) { ddPeriod = p; setActiveChip(btn); renderDeepDive(); }
function setDDSection(sec, btn) { ddSection = sec; setActiveChip(btn); renderDeepDive(); }

function getDDSessions() {
  let list = filterSessionsByPeriod(db.sessions, ddPeriod);
  if (ddSection !== 'all') list = list.filter(s => s.section === ddSection);
  return list;
}
function getDDMistakes() {
  let list = filterSessionsByPeriod(db.mistakes, ddPeriod);
  if (ddSection !== 'all') list = list.filter(m => m.section === ddSection);
  return list;
}

function ddChart(id, config) {
  if (ddCharts[id]) ddCharts[id].destroy();
  const canvas = document.getElementById(id);
  if (!canvas) return;
  ddCharts[id] = new Chart(canvas.getContext('2d'), config);
}

function weekdayIndex(iso) { const d = parseLocalDate(iso); return d ? (d.getDay() + 6) % 7 : 0; }

// ═══════════════════════════════════
// STATS
// ═══════════════════════════════════
function ddStats(sessions, mistakes) {
  const today = todayISO();
  const win = (from, to) => summarizeSessions(sessions.filter(s => s.date >= from && s.date <= to));
  const last7 = win(addDaysISO(today, -6), today);
  const prev7 = win(addDaysISO(today, -13), addDaysISO(today, -7));

  const byDay = {};
  sessions.forEach(s => { (byDay[s.date] = byDay[s.date] || []).push(s); });
  const days = Object.keys(byDay).sort();
  const span = days.length ? daysBetween(days[0], today) + 1 : 0;
  const dayStats = days.map(d => ({ date: d, ...summarizeSessions(byDay[d]) }));
  const bestDay = dayStats.filter(d => d.questions >= 10).sort((a, b) => b.accuracy - a.accuracy || b.questions - a.questions)[0];

  const weekday = WEEKDAYS.map((_, i) => summarizeSessions(sessions.filter(s => weekdayIndex(s.date) === i)));
  const lengths = LENGTH_BUCKETS.map(([lo, hi]) => summarizeSessions(sessions.filter(s => s.total >= lo && s.total <= hi)));

  // Pace relative to real test pace (100% = exactly on pace; lower = faster)
  const timed = sessions.filter(s => Number(s.minutes) > 0 && s.total > 0).map(s => ({
    s, pace: Math.round((s.minutes * 60 / s.total) / getTargetPace(s.section) * 100), acc: pct(s.correct, s.total)
  }));
  const fast = summarizeSessions(timed.filter(t => t.pace < 90).map(t => t.s));
  const onPace = summarizeSessions(timed.filter(t => t.pace >= 90 && t.pace <= 115).map(t => t.s));
  const slow = summarizeSessions(timed.filter(t => t.pace > 115).map(t => t.s));

  // Answer choice bias, from mistakes where you recorded both answers
  const withAns = mistakes.filter(m => m.myAnswer && m.correctAnswer && m.errorType !== 'guess');
  const picked = ['A', 'B', 'C', 'D'].map(l => withAns.filter(m => m.myAnswer === l).length);
  const correctWas = ['A', 'B', 'C', 'D'].map(l => withAns.filter(m => m.correctAnswer === l).length);

  const target = Number(db.settings.targetAccuracy) || 75;
  const hist = Array.from({ length: 10 }, (_, i) => sessions.filter(s => Math.min(9, Math.floor(pct(s.correct, s.total) / 10)) === i).length);
  const atTarget = sessions.filter(s => pct(s.correct, s.total) >= target).length;

  return { last7, prev7, days: dayStats, span, bestDay, weekday, lengths, timed, fast, onPace, slow, withAns, picked, correctWas, hist, atTarget, target };
}

// ═══════════════════════════════════
// RENDER
// ═══════════════════════════════════
function renderDeepDive() {
  renderTopbarStats();
  const sessions = getDDSessions();
  const mistakes = getDDMistakes();
  const empty = document.getElementById('ddEmpty');
  const body = document.getElementById('ddBody');
  if (!sessions.length) {
    empty.style.display = 'block'; body.style.display = 'none';
    document.getElementById('ddKPIs').innerHTML = '';
    return;
  }
  empty.style.display = 'none'; body.style.display = 'block';
  const st = ddStats(sessions, mistakes);
  const delta = st.last7.questions && st.prev7.questions ? st.last7.accuracy - st.prev7.accuracy : null;
  const activeDays = st.days.length;

  document.getElementById('ddKPIs').innerHTML = `
    <div class="analytics-kpi ${delta === null ? 'gold' : delta >= 0 ? 'green' : 'red'}">
      <div class="kpi-val ${delta === null ? 'gold' : delta >= 0 ? 'green' : 'red'}">${st.last7.questions ? st.last7.accuracy + '%' : '—'}</div>
      <div class="kpi-label">Last 7 Days</div>
      <div class="kpi-sub">${delta === null ? 'need 2 weeks of data' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pts vs. the week before`}</div>
    </div>
    <div class="analytics-kpi gold">
      <div class="kpi-val gold">${activeDays ? Math.round(summarizeSessions(sessions).questions / activeDays) : 0}</div>
      <div class="kpi-label">Qs per Study Day</div>
      <div class="kpi-sub">${plural(activeDays, 'study day')} in this view</div>
    </div>
    <div class="analytics-kpi amber">
      <div class="kpi-val amber">${st.span ? pct(activeDays, st.span) : 0}%</div>
      <div class="kpi-label">Consistency</div>
      <div class="kpi-sub">days studied since you started</div>
    </div>
    <div class="analytics-kpi green">
      <div class="kpi-val green">${st.bestDay ? st.bestDay.accuracy + '%' : '—'}</div>
      <div class="kpi-label">Best Day</div>
      <div class="kpi-sub">${st.bestDay ? `${formatDateTiny(st.bestDay.date)} · ${st.bestDay.questions} Qs` : '10+ Qs in a day needed'}</div>
    </div>`;

  document.getElementById('ddFindings').innerHTML = insightsHtml(ddFindings(st));
  renderDDMomentum(sessions);
  renderDDPace(st);
  renderDDWeekday(st);
  renderDDLength(st);
  renderDDBias(st);
  renderDDHist(st);
  renderDDProviderSection(sessions);
}

// Plain-English findings from the numbers
function ddFindings(st) {
  const out = [];
  const add = (pri, tone, icon, text) => out.push({ pri, tone, icon, text });
  const wk = st.weekday.map((w, i) => ({ ...w, name: WEEKDAYS[i] })).filter(w => w.questions >= 25);
  if (wk.length >= 3) {
    const best = [...wk].sort((a, b) => b.accuracy - a.accuracy)[0];
    const worst = [...wk].sort((a, b) => a.accuracy - b.accuracy)[0];
    if (best.accuracy - worst.accuracy >= 5) add(60, 'info', '📅', `<strong>${best.name}s are your best day</strong> (${best.accuracy}%) and <strong>${worst.name}s your worst</strong> (${worst.accuracy}%). Schedule hard material on ${best.name}s and lighter review on ${worst.name}s.`);
  }
  const short = st.lengths.slice(0, 2).reduce((a, b) => ({ q: a.q + b.questions, c: a.c + b.correct }), { q: 0, c: 0 });
  const long = st.lengths.slice(3).reduce((a, b) => ({ q: a.q + b.questions, c: a.c + b.correct }), { q: 0, c: 0 });
  if (short.q >= 30 && long.q >= 30) {
    const d = pct(short.c, short.q) - pct(long.c, long.q);
    if (d >= 4) add(70, 'warn', '🥱', `<strong>Fatigue shows up in long sets:</strong> ${pct(long.c, long.q)}% on 21+ question sets vs. ${pct(short.c, short.q)}% on short ones. Build stamina with full-section blocks — the real test is 59 questions.`);
    else if (d <= -3) add(40, 'good', '🏃', `<strong>You get sharper in longer sets</strong> (${pct(long.c, long.q)}% vs. ${pct(short.c, short.q)}% on short ones). Good stamina — keep doing full blocks.`);
  }
  if (st.fast.questions >= 30 && (st.onPace.questions + st.slow.questions) >= 30) {
    const rest = summarizeSessions(st.timed.filter(t => t.pace >= 90).map(t => t.s));
    const d = rest.accuracy - st.fast.accuracy;
    if (d >= 5) add(75, 'bad', '⏩', `<strong>Rushing costs you ${d} pts:</strong> ${st.fast.accuracy}% when you go faster than test pace vs. ${rest.accuracy}% at or below it. You have the time — use it.`);
  }
  if (st.slow.questions >= 30 && st.onPace.questions >= 30 && st.slow.accuracy <= st.onPace.accuracy) {
    add(55, 'warn', '🐢', `<strong>Going slow isn't buying accuracy:</strong> ${st.slow.accuracy}% when slower than test pace vs. ${st.onPace.accuracy}% on pace. Commit sooner and flag-and-move.`);
  }
  if (st.withAns.length >= 12) {
    const maxI = st.picked.indexOf(Math.max(...st.picked));
    const share = pct(st.picked[maxI], st.withAns.length);
    if (share >= 35) add(65, 'warn', '🔤', `<strong>Your wrong answers lean ${'ABCD'[maxI]}</strong> — ${share}% of your misses were choice ${'ABCD'[maxI]} (25% would be neutral). Before picking ${'ABCD'[maxI]}, double-check it actually answers the question.`);
  }
  if (st.last7.questions >= 20 && st.prev7.questions >= 20) {
    const d = st.last7.accuracy - st.prev7.accuracy;
    if (d >= 3) add(80, 'good', '📈', `<strong>Momentum: up ${d} pts this week</strong> (${st.prev7.accuracy}% → ${st.last7.accuracy}%).`);
    else if (d <= -3) add(80, 'bad', '📉', `<strong>Down ${-d} pts this week</strong> (${st.prev7.accuracy}% → ${st.last7.accuracy}%). Check Patterns for what changed — new content, or new kinds of mistakes?`);
  }
  const n = st.hist.reduce((a, b) => a + b, 0);
  if (n >= 8) add(35, 'info', '🎯', `<strong>${pct(st.atTarget, n)}% of your sets hit your ${st.target}% target</strong> (${st.atTarget} of ${n}).`);
  if (!out.length) add(10, 'info', '🔬', '<strong>Keep logging.</strong> Findings appear once there\'s enough data for each comparison (usually ~30 questions per group).');
  return out.sort((a, b) => b.pri - a.pri);
}

// Rolling 7-day accuracy with daily volume — last 60 days
function renderDDMomentum(sessions) {
  const days = Array.from({ length: 60 }, (_, i) => addDaysISO(todayISO(), i - 59));
  const daily = days.map(d => summarizeSessions(sessions.filter(s => s.date === d)));
  const rolling = days.map((d, i) => {
    const win = summarizeSessions(sessions.filter(s => s.date > addDaysISO(d, -7) && s.date <= d));
    return win.questions ? win.accuracy : null;
  });
  const target = Number(db.settings.targetAccuracy) || 75;
  ddChart('ddMomentumChart', {
    data: {
      labels: days.map(formatDateTiny),
      datasets: [
        { type: 'line', label: 'Rolling 7-day accuracy', data: rolling, borderColor: goldPalette.goldDim, backgroundColor: goldPalette.goldDim, yAxisID: 'y', tension: 0.35, pointRadius: 0, borderWidth: 3, spanGaps: true, order: 1 },
        { type: 'line', label: `Target ${target}%`, data: days.map(() => target), borderColor: 'rgba(46,125,82,0.6)', borderDash: [6, 6], borderWidth: 1.5, pointRadius: 0, yAxisID: 'y', order: 2 },
        { type: 'bar', label: 'Questions that day', data: daily.map(d => d.questions), backgroundColor: daily.map(d => d.questions ? accuracyColor(d.accuracy, 0.35) : 'transparent'), yAxisID: 'y1', borderRadius: 3, order: 3 }
      ]
    },
    options: mergeOptions(getChartDefaults(), {
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 12, maxRotation: 0 } },
        y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
        y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: chartTextColor() } }
      }
    })
  });
}

function renderDDPace(st) {
  const sub = document.getElementById('ddPaceSub');
  const fmt = x => x.questions ? `${x.accuracy}% (${x.questions} Qs)` : '—';
  sub.innerHTML = `Faster than test pace: <b>${fmt(st.fast)}</b> · On pace: <b>${fmt(st.onPace)}</b> · Slower: <b>${fmt(st.slow)}</b>`;
  ddChart('ddPaceChart', {
    type: 'scatter',
    data: {
      datasets: SECTIONS.map(sec => ({
        label: sec.short,
        data: st.timed.filter(t => t.s.section === sec.key).map(t => ({ x: t.pace, y: t.acc, s: t.s })),
        backgroundColor: hexToRgba(sec.color, 0.65), borderColor: sec.color, pointRadius: 5, pointHoverRadius: 7
      })).filter(ds => ds.data.length)
    },
    options: mergeOptions(getChartDefaults(), {
      plugins: { tooltip: { callbacks: { label: ctx => {
        const r = ctx.raw.s;
        return `${r.provider} · ${r.subject}: ${ctx.raw.y}% at ${ctx.raw.x}% of test-pace time (${formatDateTiny(r.date)})`;
      } } } },
      scales: {
        x: { title: { display: true, text: 'Time per question vs. test pace (100% = on pace · lower = faster)', color: chartTextColor() }, suggestedMin: 50, suggestedMax: 150, ticks: { callback: v => v + '%' } },
        y: { min: 0, max: 100, title: { display: true, text: 'Accuracy', color: chartTextColor() }, ticks: { callback: v => v + '%' } }
      }
    })
  });
}

function barByAccuracy(id, labels, stats, extraLabel) {
  ddChart(id, {
    type: 'bar',
    data: { labels, datasets: [{ data: stats.map(s => s.questions ? s.accuracy : null), backgroundColor: stats.map(s => accuracyColor(s.accuracy, 0.78)), borderRadius: 6, maxBarThickness: 46 }] },
    options: mergeOptions(getChartDefaults(), {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}% · ${stats[ctx.dataIndex].questions} Qs${extraLabel ? extraLabel(stats[ctx.dataIndex]) : ''}` } } },
      scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } }
    })
  });
}

function renderDDWeekday(st) {
  barByAccuracy('ddWeekdayChart', WEEKDAYS, st.weekday, s => ` in ${plural(s.sessions, 'set')}`);
}

function renderDDLength(st) {
  barByAccuracy('ddLengthChart', LENGTH_BUCKETS.map(b => b[2]), st.lengths, s => ` across ${plural(s.sessions, 'set')}`);
}

function renderDDBias(st) {
  const note = document.getElementById('ddBiasSub');
  note.textContent = st.withAns.length
    ? `From ${plural(st.withAns.length, 'miss', 'misses')} where you recorded both answers. A neutral spread is ~25% each.`
    : 'Record "answer you picked" and "correct answer" in the Daily Log to unlock this.';
  ddChart('ddBiasChart', {
    type: 'bar',
    data: {
      labels: ['A', 'B', 'C', 'D'],
      datasets: [
        { label: 'You picked (wrong)', data: st.picked.map(n => pct(n, st.withAns.length)), backgroundColor: 'rgba(192,57,43,0.7)', borderRadius: 6 },
        { label: 'Correct answer was', data: st.correctWas.map(n => pct(n, st.withAns.length)), backgroundColor: 'rgba(46,125,82,0.7)', borderRadius: 6 }
      ]
    },
    options: mergeOptions(getChartDefaults(), {
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => v + '%' } } }
    })
  });
}

function renderDDHist(st) {
  const target = st.target;
  ddChart('ddHistChart', {
    type: 'bar',
    data: {
      labels: st.hist.map((_, i) => i === 9 ? '90–100%' : `${i * 10}–${i * 10 + 9}%`),
      datasets: [{ data: st.hist, backgroundColor: st.hist.map((_, i) => accuracyColor(i * 10 + 5, 0.75)), borderRadius: 5 }]
    },
    options: mergeOptions(getChartDefaults(), {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${plural(ctx.parsed.y, 'set')}` } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxRotation: 0, font: { size: 10 } } } }
    })
  });
  document.getElementById('ddHistSub').textContent = `${st.atTarget} of ${st.hist.reduce((a, b) => a + b, 0)} sets at or above your ${target}% target`;
}

// Provider × section accuracy grid — where each source is hard for you
function renderDDProviderSection(sessions) {
  const provs = [...new Set(sessions.map(s => s.provider || 'Unspecified'))]
    .map(p => ({ p, n: sessions.filter(s => (s.provider || 'Unspecified') === p).length }))
    .sort((a, b) => b.n - a.n).map(x => x.p);
  const secs = ddSection === 'all' ? SECTIONS : SECTIONS.filter(s => s.key === ddSection);
  document.getElementById('ddProviderGrid').innerHTML = `<table class="heatmap-table">
    <thead><tr><th>Provider</th>${secs.map(sec => `<th><span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span></th>`).join('')}<th>Overall</th></tr></thead>
    <tbody>${provs.map(p => {
      const ps = sessions.filter(s => (s.provider || 'Unspecified') === p);
      const all = summarizeSessions(ps);
      return `<tr><td><strong>${escapeHtml(p)}</strong></td>${secs.map(sec => {
        const st = summarizeSessions(ps.filter(s => s.section === sec.key));
        if (!st.questions) return '<td class="heat-cell empty">—</td>';
        return `<td class="heat-cell" style="background:${accuracyColor(st.accuracy, 0.22 + Math.min(0.5, st.questions / 400))}" title="${st.correct}/${st.questions} correct"
          onclick="openPracticeListFiltered({ provider: ${jsArg(p)}, section: '${sec.short}' })">${st.accuracy}%<small>${st.questions} Qs</small></td>`;
      }).join('')}<td class="heat-cell overall">${all.accuracy}%<small>${all.questions} Qs</small></td></tr>`;
    }).join('')}</tbody></table>`;
}
