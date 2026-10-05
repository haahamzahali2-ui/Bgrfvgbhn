// ═══════════════════════════════════
// ANALYTICS — by section, subject, provider: grid landing + drill-down detail
// ═══════════════════════════════════

let analyticsDim = 'section';          // 'section' | 'subject' | 'provider'
let currentAnalyticsTimeFilter = 'all';
let analyticsDrilldown = null;         // { dim, key } or null while on the overview
let detailSubDim = 'subject';

let overviewBarChartInst = null, overviewTrendChartInst = null;
let detailBarChartInst = null, detailTrendChartInst = null;

let lastGridStats = [];
let lastFocusRows = [];
let lastDetailStats = [];
let detailTableSearchTerm = '';
let detailTableSort = { field: 'questions', dir: 'desc' };

const DIM_ORDER = ['section', 'subject', 'provider'];

// ═══════════════════════════════════
// STATS
// ═══════════════════════════════════
// Compares accuracy of the most recent half of sets with the earlier half
function getAccuracyTrend(sessions) {
  if (sessions.length < 4) return { trend: 'new', diff: null };
  const sorted = [...sessions].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
  const mid = Math.floor(sorted.length / 2);
  const early = summarizeSessions(sorted.slice(0, mid));
  const late = summarizeSessions(sorted.slice(mid));
  const diff = late.accuracy - early.accuracy;
  if (diff >= 3) return { trend: 'improving', diff };
  if (diff <= -3) return { trend: 'worsening', diff };
  return { trend: 'stable', diff };
}

function computeGroupStats(sessions, dim) {
  const groups = {};
  sessions.forEach(s => {
    const key = getDimValue(s, dim);
    (groups[key] = groups[key] || []).push(s);
  });
  const stats = Object.keys(groups).map(key => {
    const sum = summarizeSessions(groups[key]);
    const { trend, diff } = getAccuracyTrend(groups[key]);
    return { key, ...sum, trend, trendScore: diff === null ? -999 : diff };
  });
  if (dim === 'section') {
    const order = SECTIONS.map(s => s.short);
    return stats.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }
  return stats.sort((a, b) => b.questions - a.questions || a.key.localeCompare(b.key));
}

function getGroupColor(dim, key, idx) {
  if (dim === 'section') return getSectionByShort(key)?.color || goldPalette.gold;
  return GROUP_COLORS[idx % GROUP_COLORS.length];
}

function getAnalyticsSessions() {
  return filterSessionsByPeriod(db.sessions, currentAnalyticsTimeFilter);
}

function formatPace(secPerQ) {
  if (secPerQ === null || secPerQ === undefined) return '—';
  const m = Math.floor(secPerQ / 60), s = secPerQ % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

// ═══════════════════════════════════
// KPIs
// ═══════════════════════════════════
function renderAnalyticsKPIs(sessions) {
  const el = document.getElementById('analyticsKPIs');
  if (!el) return;
  const sum = summarizeSessions(sessions);
  const { trend, diff } = getAccuracyTrend(sessions);
  const target = Number(db.settings.targetAccuracy) || 75;
  const accClass = sum.questions ? ({ high: 'green', medium: 'amber', low: 'red' })[getAccuracyClass(sum.accuracy)] : 'gold';
  el.innerHTML = `
    <div class="analytics-kpi gold">
      <div class="kpi-val gold">${sum.questions.toLocaleString()}</div>
      <div class="kpi-label">Questions</div>
      <div class="kpi-sub">${sum.sessions} set${sum.sessions !== 1 ? 's' : ''} · ${Math.round(sum.minutes / 60 * 10) / 10} hrs</div>
    </div>
    <div class="analytics-kpi ${accClass}">
      <div class="kpi-val ${accClass}">${sum.questions ? sum.accuracy + '%' : '—'}</div>
      <div class="kpi-label">Accuracy</div>
      <div class="kpi-sub">target ${target}%</div>
    </div>
    <div class="analytics-kpi ${trend === 'worsening' ? 'red' : 'green'}">
      <div class="kpi-val ${trend === 'worsening' ? 'red' : 'green'}">${diff === null ? '—' : (diff > 0 ? '+' : '') + diff}</div>
      <div class="kpi-label">Trend (pts)</div>
      <div class="kpi-sub">${diff === null ? 'need 4+ sets' : 'recent half vs. earlier half'}</div>
    </div>
    <div class="analytics-kpi amber">
      <div class="kpi-val amber">${formatPace(sum.secPerQ)}</div>
      <div class="kpi-label">Avg. Pace</div>
      <div class="kpi-sub">per question (timed sets)</div>
    </div>
  `;
}

// ═══════════════════════════════════
// ENTRY POINT — toggles overview / detail
// ═══════════════════════════════════
function renderAnalytics() {
  renderTopbarStats();
  const sessions = getAnalyticsSessions();
  const statsEl = document.getElementById('analyticsTimeStats');
  if (statsEl) statsEl.textContent = currentAnalyticsTimeFilter !== 'all' ? `${sessions.length} set${sessions.length !== 1 ? 's' : ''} in period` : '';

  const overviewEl = document.getElementById('analyticsOverview');
  const detailEl = document.getElementById('analyticsDetail');
  if (analyticsDrilldown) {
    overviewEl.style.display = 'none';
    detailEl.style.display = 'block';
    renderAnalyticsDetail();
  } else {
    detailEl.style.display = 'none';
    overviewEl.style.display = 'block';
    renderAnalyticsOverview();
  }
}

function setAnalyticsTimeFilter(filter, btn) {
  currentAnalyticsTimeFilter = filter;
  document.querySelectorAll('#page-analytics .time-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAnalytics();
}

function setAnalyticsDim(dim, btn) {
  analyticsDim = dim;
  document.querySelectorAll('#analyticsDimTabs .breakdown-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAnalytics();
}

// Jump straight into a drill-down from elsewhere (e.g., home section snapshot)
function openAnalyticsFor(dim, key) {
  analyticsDim = dim;
  document.querySelectorAll('#analyticsDimTabs .breakdown-tab').forEach((b, i) => b.classList.toggle('active', DIM_ORDER[i] === dim));
  analyticsDrilldown = { dim, key };
  detailSubDim = DIM_ORDER.find(d => d !== dim);
  showPage('analytics');
}

// ═══════════════════════════════════
// OVERVIEW — grid + charts + focus areas
// ═══════════════════════════════════
function renderAnalyticsOverview() {
  const bc = document.getElementById('drilldownBreadcrumb');
  if (bc) { bc.style.display = 'none'; bc.innerHTML = ''; }

  const sessions = getAnalyticsSessions();
  renderAnalyticsKPIs(sessions);
  lastGridStats = computeGroupStats(sessions, analyticsDim);
  renderGroupGrid();
  renderOverviewBarChart();
  renderOverviewTrendChart(sessions);
  renderFocusTable(sessions);
}

function renderGroupGrid() {
  const grid = document.getElementById('groupGrid');
  if (!grid) return;
  if (!lastGridStats.length) {
    grid.innerHTML = `<div class="patients-empty-state">
      <div class="patients-empty-icon">📊</div>
      <div class="patients-empty-title">No practice in this period</div>
      <div class="patients-empty-sub">Log a practice set to see analytics here</div>
    </div>`;
    return;
  }
  grid.innerHTML = lastGridStats.map((g, i) => {
    const sec = analyticsDim === 'section' ? getSectionByShort(g.key) : null;
    return `<div class="group-card" onclick="onGroupClick(${i})" ${sec ? `style="--sec-color:${sec.color}"` : ''}>
      <div class="group-card-top">
        <div class="group-card-name">${sec ? sec.name : escapeHtml(g.key)}</div>
        ${sec ? `<span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>` : ''}
      </div>
      <div class="group-card-stats">
        <span class="group-card-total">${g.questions.toLocaleString()} Q · ${g.sessions} set${g.sessions !== 1 ? 's' : ''}</span>
        <span class="group-card-rate ${getAccuracyClass(g.accuracy)}">${g.accuracy}%</span>
      </div>
      <div class="group-card-trend">${trendBadge(g.trend)}</div>
    </div>`;
  }).join('');
}

function onGroupClick(idx) {
  const g = lastGridStats[idx];
  if (!g) return;
  analyticsDrilldown = { dim: analyticsDim, key: g.key };
  if (detailSubDim === analyticsDim) detailSubDim = DIM_ORDER.find(d => d !== analyticsDim);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAnalytics();
}

function renderAccuracyBarChart(canvasId, containerId, stats, existingInst, onBarClick) {
  const canvas = document.getElementById(canvasId);
  const container = document.getElementById(containerId);
  if (existingInst) existingInst.destroy();
  if (!canvas || !container) return null;
  container.style.height = Math.max(240, stats.length * 38 + 50) + 'px';
  if (!stats.length) return null;

  const target = Number(db.settings.targetAccuracy) || 75;
  return new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: stats.map(g => g.key),
      datasets: [{
        label: 'Accuracy (%)',
        data: stats.map(g => g.accuracy),
        backgroundColor: stats.map(g => accuracyColor(g.accuracy, 0.78)),
        borderRadius: 6, maxBarThickness: 26
      }]
    },
    options: mergeOptions(getChartDefaults(), {
      indexAxis: 'y',
      onClick: (evt, elements) => { if (elements.length) onBarClick(elements[0].index); },
      onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => {
          const g = stats[ctx.dataIndex];
          return `${g.accuracy}% correct · ${g.correct}/${g.questions} Qs · target ${target}%`;
        } } }
      },
      scales: { x: { beginAtZero: true, max: 100, title: { display: true, text: 'Accuracy (%)', color: chartTextColor() } } }
    })
  });
}

function renderOverviewBarChart() {
  const titleEl = document.getElementById('overviewBarTitle');
  if (titleEl) titleEl.textContent = `Accuracy by ${DIM_LABELS[analyticsDim]}`;
  overviewBarChartInst = renderAccuracyBarChart('overviewBarChart', 'overviewBarContainer', lastGridStats, overviewBarChartInst, onGroupClick);
}

function renderOverviewTrendChart(sessions) {
  const canvas = document.getElementById('overviewTrendChart');
  if (overviewTrendChartInst) overviewTrendChartInst.destroy();
  overviewTrendChartInst = null;
  if (!canvas) return;

  const top = [...lastGridStats].sort((a, b) => b.questions - a.questions).slice(0, analyticsDim === 'section' ? 4 : 5);
  const sub = document.getElementById('overviewTrendSub');
  if (sub) sub.textContent = analyticsDim === 'section'
    ? 'Weekly accuracy for each MCAT section'
    : `Weekly accuracy — top ${top.length} ${DIM_LABELS_PLURAL[analyticsDim].toLowerCase()} by volume`;

  const weeks = getWeekRange(sessions);
  if (!weeks.length) return;
  const datasets = top.map(g => {
    const idx = lastGridStats.indexOf(g);
    const color = getGroupColor(analyticsDim, g.key, idx);
    const series = weeklySeries(sessions.filter(s => getDimValue(s, analyticsDim) === g.key), weeks);
    return {
      label: g.key, data: series.accuracy, borderColor: color, backgroundColor: color,
      tension: 0.3, spanGaps: true, pointRadius: 3, borderWidth: 2.5
    };
  });
  overviewTrendChartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: weeks.map(w => `Wk of ${formatWeekLabel(w)}`), datasets },
    options: mergeOptions(getChartDefaults(), {
      scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%` } } }
    })
  });
}

// Weakest subject + section combos
function renderFocusTable(sessions) {
  const tbody = document.querySelector('#focusTable tbody');
  if (!tbody) return;
  const groups = {};
  sessions.forEach(s => {
    const k = `${getDimValue(s, 'subject')}|${getDimValue(s, 'section')}`;
    (groups[k] = groups[k] || []).push(s);
  });
  lastFocusRows = Object.keys(groups).map(k => {
    const [subject, section] = k.split('|');
    const list = groups[k];
    const sum = summarizeSessions(list);
    const byProvider = computeGroupStats(list, 'provider');
    return { subject, section, ...sum, topProvider: byProvider[0]?.key || '—', trend: getAccuracyTrend(list).trend };
  }).filter(r => r.questions >= 10).sort((a, b) => a.accuracy - b.accuracy).slice(0, 6);

  if (!lastFocusRows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Log at least 10 questions in a subject to see focus areas</td></tr>`;
    return;
  }
  tbody.innerHTML = lastFocusRows.map((r, i) => {
    const sec = getSectionByShort(r.section);
    return `<tr onclick="onFocusRowClick(${i})">
      <td><strong>${escapeHtml(r.subject)}</strong></td>
      <td><span class="section-badge" style="--sec-color:${sec ? sec.color : goldPalette.gold}">${escapeHtml(r.section)}</span></td>
      <td>${r.questions}</td>
      <td><span class="group-card-rate ${getAccuracyClass(r.accuracy)}">${r.accuracy}%</span></td>
      <td>${escapeHtml(r.topProvider)}</td>
      <td>${trendBadge(r.trend)}</td>
    </tr>`;
  }).join('');
}

function onFocusRowClick(idx) {
  const r = lastFocusRows[idx];
  if (r) openPracticeListFiltered({ subject: r.subject, section: r.section });
}

// ═══════════════════════════════════
// DETAIL — one section / subject / provider
// ═══════════════════════════════════
function renderAnalyticsDetail() {
  const { dim, key } = analyticsDrilldown;
  const sec = dim === 'section' ? getSectionByShort(key) : null;
  const bc = document.getElementById('drilldownBreadcrumb');
  if (bc) {
    bc.style.display = 'flex';
    bc.innerHTML = `
      <button class="back-btn" onclick="exitAnalyticsDrilldown()">&#8592; All ${DIM_LABELS_PLURAL[dim]}</button>
      <span class="drilldown-title">${sec ? `${sec.name} <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>` : escapeHtml(key)}</span>
      <button class="filter-clear-btn" style="margin-left:auto" onclick="openPracticeListFiltered({ ${dim}: analyticsDrilldown.key })">View all sets →</button>
    `;
  }

  const matched = getAnalyticsSessions().filter(s => getDimValue(s, dim) === key);
  renderAnalyticsKPIs(matched);

  // Sub-dimension toggle (the two dimensions you didn't drill into)
  const subDims = DIM_ORDER.filter(d => d !== dim);
  if (!subDims.includes(detailSubDim)) detailSubDim = subDims[0];
  const toggle = document.getElementById('detailSubDimToggle');
  if (toggle) toggle.innerHTML = subDims.map(d =>
    `<button class="${d === detailSubDim ? 'active' : ''}" onclick="setDetailSubDim('${d}')">By ${DIM_LABELS[d]}</button>`
  ).join('');

  const titleEl = document.getElementById('detailChartTitle');
  if (titleEl) titleEl.textContent = `${sec ? sec.name : key} — by ${DIM_LABELS[detailSubDim]}`;

  lastDetailStats = computeGroupStats(matched, detailSubDim);
  detailBarChartInst = renderAccuracyBarChart('detailBarChart', 'detailBarContainer', lastDetailStats, detailBarChartInst, idx => onDetailRowClick(lastDetailStats[idx].key));
  renderDetailTrendChart(matched, sec ? sec.color : goldPalette.gold);

  detailTableSearchTerm = '';
  detailTableSort = { field: 'questions', dir: 'desc' };
  const searchInput = document.getElementById('detailTableSearch');
  if (searchInput) searchInput.value = '';
  const headerEl = document.getElementById('detailTableGroupHeader');
  const subEl = document.getElementById('detailTableSub');
  if (headerEl) headerEl.textContent = DIM_LABELS[detailSubDim];
  if (subEl) subEl.textContent = `By ${DIM_LABELS[detailSubDim].toLowerCase()} — click a row to view those practice sets`;
  renderDetailTableRows();
}

function setDetailSubDim(d) {
  detailSubDim = d;
  renderAnalyticsDetail();
}

function exitAnalyticsDrilldown() {
  analyticsDrilldown = null;
  renderAnalytics();
}

function onDetailRowClick(subKey) {
  const { dim, key } = analyticsDrilldown;
  openPracticeListFiltered({ [dim]: key, [detailSubDim]: subKey });
}

function renderDetailTrendChart(sessions, color) {
  const canvas = document.getElementById('detailTrendChart');
  if (detailTrendChartInst) detailTrendChartInst.destroy();
  detailTrendChartInst = null;
  if (!canvas) return;
  const weeks = getWeekRange(sessions);
  if (!weeks.length) return;
  const series = weeklySeries(sessions, weeks);
  detailTrendChartInst = new Chart(canvas.getContext('2d'), {
    data: {
      labels: weeks.map(w => `Wk of ${formatWeekLabel(w)}`),
      datasets: [
        { type: 'line', label: 'Accuracy (%)', data: series.accuracy, borderColor: color, backgroundColor: color, yAxisID: 'y', tension: 0.3, spanGaps: true, pointRadius: 4, borderWidth: 3, order: 1 },
        { type: 'bar', label: 'Questions', data: series.questions, backgroundColor: 'rgba(201,168,76,0.25)', borderRadius: 4, yAxisID: 'y1', order: 2 }
      ]
    },
    options: mergeOptions(getChartDefaults(), {
      scales: {
        y: { min: 0, max: 100, position: 'left', ticks: { callback: v => v + '%' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: chartTextColor(), font: { family: "'DM Sans'", size: 11 } } }
      }
    })
  });
}

// ═══════════════════════════════════
// DETAIL TABLE — sortable, searchable
// ═══════════════════════════════════
function filterDetailTable() {
  detailTableSearchTerm = document.getElementById('detailTableSearch')?.value.trim() || '';
  renderDetailTableRows();
}

function sortDetailTable(field) {
  if (detailTableSort.field === field) {
    detailTableSort.dir = detailTableSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    detailTableSort.field = field;
    detailTableSort.dir = field === 'key' ? 'asc' : 'desc';
  }
  renderDetailTableRows();
}

function renderDetailTableRows() {
  const tbody = document.querySelector('#detailTable tbody');
  if (!tbody) return;
  let rows = [...lastDetailStats];
  if (detailTableSearchTerm) {
    const q = detailTableSearchTerm.toLowerCase();
    rows = rows.filter(g => g.key.toLowerCase().includes(q));
  }
  const { field, dir } = detailTableSort;
  rows.sort((a, b) => {
    let av = a[field], bv = b[field];
    if (field === 'key') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (field === 'secPerQ') { av = av === null ? -1 : av; bv = bv === null ? -1 : bv; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No matches</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(g => {
      const idx = lastDetailStats.indexOf(g);
      return `<tr onclick="onDetailRowClick(lastDetailStats[${idx}].key)">
        <td><strong>${escapeHtml(g.key)}</strong></td>
        <td>${g.sessions}</td>
        <td>${g.questions}</td>
        <td><span class="group-card-rate ${getAccuracyClass(g.accuracy)}">${g.accuracy}%</span></td>
        <td>${formatPace(g.secPerQ)}</td>
        <td>${trendBadge(g.trend)}</td>
      </tr>`;
    }).join('');
  }

  document.querySelectorAll('#detailTable thead th[data-sort]').forEach(th => {
    const f = th.getAttribute('data-sort');
    th.classList.toggle('sorted-asc', detailTableSort.field === f && detailTableSort.dir === 'asc');
    th.classList.toggle('sorted-desc', detailTableSort.field === f && detailTableSort.dir === 'desc');
  });
}
