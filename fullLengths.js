// ═══════════════════════════════════
// FULL-LENGTH EXAMS — render, CRUD, score trend, provider + section tables
// ═══════════════════════════════════

let editingFLId = null;
let flChartMode = 'total'; // 'total' | 'sections'
let flTrendChartInst = null;

// ═══════════════════════════════════
// STATUS — vs. target score
// ═══════════════════════════════════
function getFLStatus(total) {
  const target = Number(db.settings.targetScore);
  if (!target) return 'neutral';
  if (total >= target) return 'high';
  if (total >= target - 5) return 'medium';
  return 'low';
}

function getSectionTrend(values) {
  if (values.length < 2) return 'new';
  const diff = values[values.length - 1] - values[values.length - 2];
  if (diff >= 1) return 'improving';
  if (diff <= -1) return 'worsening';
  return 'stable';
}

function trendBadge(trend) {
  const map = {
    improving: ['↑', 'Improving'], worsening: ['↓', 'Declining'],
    stable: ['→', 'Stable'], new: ['•', 'New']
  };
  const [arrow, label] = map[trend] || map.new;
  return `<span class="trend-badge ${trend}"><span class="trend-arrow">${arrow}</span>${label}</span>`;
}

// ═══════════════════════════════════
// SCORE OUTLOOK — prediction, percentile, projection
// ═══════════════════════════════════
// Approximate total-score percentile ranks (based on recent AAMC-published data; rounded)
const PERCENTILE_TABLE = [[472, 0], [480, 2], [485, 6], [490, 15], [495, 29], [498, 40], [500, 46], [502, 53], [504, 60],
  [506, 67], [508, 73], [510, 79], [512, 84], [514, 88], [516, 92], [518, 95], [520, 97], [522, 98], [524, 99], [528, 100]];

function estimatePercentile(score) {
  if (score <= PERCENTILE_TABLE[0][0]) return 0;
  for (let i = 1; i < PERCENTILE_TABLE.length; i++) {
    const [s1, p1] = PERCENTILE_TABLE[i];
    const [s0, p0] = PERCENTILE_TABLE[i - 1];
    if (score <= s1) return Math.round(p0 + (p1 - p0) * (score - s0) / (s1 - s0));
  }
  return 100;
}

// Recency-weighted (3-2-1) average of the last three exams; AAMC exams count 1.5×
function weightedRecent(fls, valueFn) {
  const recent = fls.slice(-3);
  let sum = 0, w = 0;
  recent.forEach((f, i) => {
    const weight = (i + 1 + (3 - recent.length)) * (f.provider === 'AAMC' ? 1.5 : 1);
    sum += valueFn(f) * weight; w += weight;
  });
  return sum / w;
}

function computeScoreOutlook() {
  const fls = getSortedFLs();
  if (!fls.length) return null;
  const totals = fls.map(getFLTotal);
  const predicted = Math.round(weightedRecent(fls, getFLTotal));
  const last5 = totals.slice(-5);
  const mean = last5.reduce((a, b) => a + b, 0) / last5.length;
  const sd = Math.sqrt(last5.reduce((a, b) => a + (b - mean) ** 2, 0) / last5.length);
  const range = fls.length >= 3 ? Math.max(2, Math.min(6, Math.round(sd))) : 4;

  // Linear trend in points/day, clamped to realistic gains
  let slope = null;
  if (fls.length >= 3) {
    const xs = fls.map(f => daysBetween(fls[0].date, f.date));
    const xm = xs.reduce((a, b) => a + b, 0) / xs.length;
    const ym = totals.reduce((a, b) => a + b, 0) / totals.length;
    const den = xs.reduce((a, x) => a + (x - xm) ** 2, 0);
    if (den > 0) slope = Math.max(-0.15, Math.min(0.3, xs.reduce((a, x, i) => a + (x - xm) * (totals[i] - ym), 0) / den));
  }
  const daysLeft = getDaysUntilTest();
  let projected = null;
  if (slope !== null && daysLeft !== null && daysLeft > 0) {
    projected = Math.max(472, Math.min(528, Math.round(predicted + Math.min(15, slope * daysLeft))));
  }
  const target = Number(db.settings.targetScore) || null;
  let eta = null;
  if (target && slope > 0.01 && predicted < target) eta = addDaysISO(todayISO(), Math.ceil((target - predicted) / slope));

  const sections = {};
  SECTIONS.forEach(sec => { sections[sec.key] = Math.round(weightedRecent(fls, f => Number(f[sec.key])) * 10) / 10; });
  return {
    predicted, range, percentile: estimatePercentile(predicted), projected,
    projectedPercentile: projected ? estimatePercentile(projected) : null,
    slopeWeek: slope === null ? null : Math.round(slope * 7 * 10) / 10,
    target, eta, sections, basedOn: Math.min(3, fls.length), count: fls.length
  };
}

function renderScoreOutlook() {
  const el = document.getElementById('scoreOutlook');
  if (!el) return;
  const o = computeScoreOutlook();
  if (!o) {
    el.innerHTML = `<div class="table-empty" style="padding:22px">Add a full-length to see your predicted score, percentile, and test-day projection.</div>`;
    return;
  }
  const lever = SECTIONS.reduce((a, b) => (o.sections[a.key] <= o.sections[b.key] ? a : b));
  const daysLeft = getDaysUntilTest();
  el.innerHTML = `
    <div class="outlook-grid">
      <div class="outlook-main">
        <div class="outlook-label">Predicted score today</div>
        <div class="outlook-score">${o.predicted}<span>± ${o.range}</span></div>
        <div class="outlook-pct">≈ ${ordinal(o.percentile)} percentile</div>
        <div class="outlook-range-bar">
          <div class="orb-track"></div>
          <div class="orb-band" style="left:${((o.predicted - o.range - 472) / 56) * 100}%;width:${(o.range * 2 / 56) * 100}%"></div>
          <div class="orb-dot" style="left:${((o.predicted - 472) / 56) * 100}%"></div>
          ${o.target ? `<div class="orb-target" style="left:${((o.target - 472) / 56) * 100}%" title="Target ${o.target}"><span>🎯 ${o.target}</span></div>` : ''}
          <div class="orb-scale"><span>472</span><span>500</span><span>528</span></div>
        </div>
        <div class="outlook-method">Weighted average of your last ${plural(o.basedOn, 'exam')} (recent and AAMC exams count more). Percentiles are approximate.</div>
      </div>
      <div class="outlook-side">
        <div class="outlook-stat">
          <div class="outlook-stat-label">Trend</div>
          <div class="outlook-stat-val ${o.slopeWeek > 0 ? 'up' : o.slopeWeek < 0 ? 'down' : ''}">${o.slopeWeek === null ? '—' : `${o.slopeWeek > 0 ? '+' : ''}${o.slopeWeek} pts/wk`}</div>
          <div class="outlook-stat-sub">${o.slopeWeek === null ? 'needs 3+ exams' : 'line of best fit across all exams'}</div>
        </div>
        <div class="outlook-stat">
          <div class="outlook-stat-label">Test-day projection</div>
          <div class="outlook-stat-val">${o.projected ?? '—'}</div>
          <div class="outlook-stat-sub">${o.projected ? `≈ ${ordinal(o.projectedPercentile)} percentile · ${daysLeft} days out` : daysLeft === null ? 'set a test date in ⚙️ settings' : 'needs 3+ exams'}</div>
        </div>
        <div class="outlook-stat">
          <div class="outlook-stat-label">Target</div>
          <div class="outlook-stat-val">${o.target ?? '—'}</div>
          <div class="outlook-stat-sub">${!o.target ? 'set a target in ⚙️ settings' : o.predicted >= o.target ? 'you\'re there — protect it' : o.eta ? `on pace to hit it ~${formatDateTiny(o.eta)}${db.settings.testDate && o.eta > db.settings.testDate ? ' (after test day)' : ''}` : `${o.target - o.predicted} pts to go`}</div>
        </div>
      </div>
      <div class="outlook-sections">
        <div class="outlook-label">Predicted by section</div>
        ${SECTIONS.map(sec => `
          <div class="os-row ${sec.key === lever.key ? 'lever' : ''}">
            <span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span>
            <div class="os-bar"><span style="width:${((o.sections[sec.key] - 118) / 14) * 100}%;background:${sec.color}"></span></div>
            <div class="os-val">${o.sections[sec.key].toFixed(1)}</div>
          </div>`).join('')}
        <div class="outlook-lever">🏋️ Biggest lever: <strong>${lever.name}</strong> — gains are cheapest where you're lowest.</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════
// RENDER — page entry point
// ═══════════════════════════════════
function renderFullLengths() {
  renderTopbarStats();
  const fls = getSortedFLs();
  const countEl = document.getElementById('flCountLabel');
  if (countEl) countEl.textContent = `${fls.length} exam${fls.length !== 1 ? 's' : ''} taken`;

  renderFLKPIs(fls);
  renderScoreOutlook();
  renderFLTrendChart(fls);
  renderFLProviderTable(fls);
  renderFLSectionTable(fls);
  renderFLGrid(fls);
}

function renderFLKPIs(fls) {
  const el = document.getElementById('flKPIs');
  if (!el) return;
  const totals = fls.map(getFLTotal);
  const latest = totals[totals.length - 1];
  const best = totals.length ? Math.max(...totals) : null;
  const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
  const change = totals.length >= 2 ? latest - totals[0] : null;
  const target = Number(db.settings.targetScore);
  el.innerHTML = `
    <div class="analytics-kpi gold">
      <div class="kpi-val gold">${latest ?? '—'}</div>
      <div class="kpi-label">Latest Score</div>
      <div class="kpi-sub">${target ? `target ${target}` : 'set a target in ⚙️ settings'}</div>
    </div>
    <div class="analytics-kpi green">
      <div class="kpi-val green">${best ?? '—'}</div>
      <div class="kpi-label">Best Score</div>
      <div class="kpi-sub">${fls.length ? `across ${fls.length} exam${fls.length !== 1 ? 's' : ''}` : 'no exams yet'}</div>
    </div>
    <div class="analytics-kpi amber">
      <div class="kpi-val amber">${avg ?? '—'}</div>
      <div class="kpi-label">Average</div>
    </div>
    <div class="analytics-kpi ${change !== null && change < 0 ? 'red' : 'green'}">
      <div class="kpi-val ${change !== null && change < 0 ? 'red' : 'green'}">${change === null ? '—' : (change > 0 ? '+' : '') + change}</div>
      <div class="kpi-label">Change</div>
      <div class="kpi-sub">first exam → latest</div>
    </div>
  `;
}

function setFLChartMode(mode, btn) {
  flChartMode = mode;
  document.querySelectorAll('#flChartToggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFLTrendChart(getSortedFLs());
}

function renderFLTrendChart(fls) {
  const canvas = document.getElementById('flTrendChart');
  if (!canvas) return;
  if (flTrendChartInst) flTrendChartInst.destroy();
  flTrendChartInst = null;

  const labels = fls.map(f => `${f.name || f.provider} · ${formatWeekLabel(f.date)}`);
  const target = Number(db.settings.targetScore);
  const outlook = computeScoreOutlook();
  const showProjection = flChartMode === 'total' && outlook && outlook.projected;
  if (showProjection) labels.push(`Test day · ${formatWeekLabel(db.settings.testDate)}`);
  let datasets, yOpts;

  if (flChartMode === 'total') {
    datasets = [{
      label: 'Total Score', data: fls.map(getFLTotal),
      borderColor: goldPalette.gold, backgroundColor: 'rgba(201,168,76,0.15)',
      pointBackgroundColor: fls.map(f => {
        const st = getFLStatus(getFLTotal(f));
        return st === 'high' ? goldPalette.green : st === 'medium' ? goldPalette.amber : st === 'low' ? goldPalette.red : goldPalette.gold;
      }),
      pointRadius: 6, pointHoverRadius: 8, borderWidth: 3, tension: 0.3, fill: true
    }];
    if (showProjection) {
      datasets.push({
        label: `Projection (${outlook.projected})`,
        data: [...fls.map((f, i) => i === fls.length - 1 ? getFLTotal(f) : null), outlook.projected],
        borderColor: 'rgba(168,137,60,0.8)', borderDash: [4, 5], borderWidth: 2, pointRadius: [...fls.map(() => 0), 6],
        pointStyle: 'rectRot', pointBackgroundColor: goldPalette.goldDim, fill: false, spanGaps: true
      });
    }
    if (target) {
      datasets.push({
        label: `Target (${target})`, data: labels.map(() => target),
        borderColor: 'rgba(46,125,82,0.7)', borderDash: [6, 6], borderWidth: 2, pointRadius: 0, fill: false
      });
    }
    const vals = fls.map(getFLTotal).concat(target ? [target] : []).concat(showProjection ? [outlook.projected] : []);
    yOpts = { min: vals.length ? Math.max(472, Math.min(...vals) - 4) : 472, max: vals.length ? Math.min(528, Math.max(...vals) + 4) : 528 };
  } else {
    datasets = SECTIONS.map(sec => ({
      label: sec.name, data: fls.map(f => Number(f[sec.key])),
      borderColor: sec.color, backgroundColor: sec.color,
      pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5, tension: 0.3, fill: false
    }));
    yOpts = { min: 118, max: 132 };
  }

  flTrendChartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: mergeOptions(getChartDefaults(), {
      scales: { y: { ...yOpts, ticks: { stepSize: flChartMode === 'total' ? 2 : 1 } } },
      plugins: { legend: { display: flChartMode === 'sections' || !!target || showProjection } }
    })
  });
}

function renderFLProviderTable(fls) {
  const tbody = document.querySelector('#flProviderTable tbody');
  if (!tbody) return;
  const groups = {};
  fls.forEach(f => {
    const key = f.provider || 'Unspecified';
    if (!groups[key]) groups[key] = [];
    groups[key].push(getFLTotal(f));
  });
  const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || a.localeCompare(b));
  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No exams yet</td></tr>`;
    return;
  }
  tbody.innerHTML = keys.map(k => {
    const t = groups[k];
    const avg = Math.round(t.reduce((a, b) => a + b, 0) / t.length);
    return `<tr>
      <td><strong>${escapeHtml(k)}</strong></td>
      <td>${t.length}</td>
      <td>${avg}</td>
      <td>${Math.max(...t)}</td>
      <td>${t[t.length - 1]}</td>
    </tr>`;
  }).join('');
}

function renderFLSectionTable(fls) {
  const tbody = document.querySelector('#flSectionTable tbody');
  if (!tbody) return;
  if (!fls.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No exams yet</td></tr>`;
    return;
  }
  tbody.innerHTML = SECTIONS.map(sec => {
    const vals = fls.map(f => Number(f[sec.key]));
    const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
    return `<tr>
      <td><span class="section-badge" style="--sec-color:${sec.color}">${sec.short}</span> ${sec.name}</td>
      <td>${avg}</td>
      <td>${Math.max(...vals)}</td>
      <td>${vals[vals.length - 1]}</td>
      <td>${trendBadge(getSectionTrend(vals))}</td>
    </tr>`;
  }).join('');
}

function renderFLGrid(fls) {
  const grid = document.getElementById('flGrid');
  if (!grid) return;
  if (!fls.length) {
    grid.innerHTML = `<div class="patients-empty-state">
      <div class="patients-empty-icon">📝</div>
      <div class="patients-empty-title">No full-lengths yet</div>
      <div class="patients-empty-sub">Add your first practice exam to start tracking your scaled score</div>
    </div>`;
    return;
  }
  grid.innerHTML = [...fls].reverse().map(f => {
    const total = getFLTotal(f);
    const status = getFLStatus(total);
    return `<div class="session-card fl-card ${status}" onclick="openEditFLModal(${jsArg(f.id)})">
      <div class="session-card-stripe"></div>
      <div class="session-card-body">
        <div class="session-card-header">
          <div class="session-card-id-group">
            <span class="session-card-id-label">${escapeHtml(f.provider) || 'Exam'}</span>
            <span class="session-card-acc ${status}">${total}</span>
          </div>
          <span class="fl-date-badge">${formatDateShort(f.date)}</span>
        </div>
        <div class="session-card-subject">${escapeHtml(f.name) || 'Full-Length'}</div>
        <div class="fl-section-row">
          ${SECTIONS.map(sec => `<div class="fl-section-block" style="--sec-color:${sec.color}">
            <div class="session-date-label">${sec.short}</div>
            <div class="fl-section-val">${escapeHtml(f[sec.key])}</div>
          </div>`).join('')}
        </div>
        ${f.notes ? `<div class="session-card-notes">${escapeHtml(f.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════
// MODAL — ADD / EDIT
// ═══════════════════════════════════
function openAddFLModal() {
  editingFLId = null;
  document.getElementById('flModalTitle').textContent = 'Add Full-Length';
  document.getElementById('fl-date').value = todayISO();
  document.getElementById('fl-provider').value = 'AAMC';
  document.getElementById('fl-name').value = '';
  SECTIONS.forEach(sec => { document.getElementById(`fl-${sec.key}`).value = ''; });
  document.getElementById('fl-notes').value = '';
  fillDatalist('flProviderOptions', [...new Set([...FL_PROVIDERS, ...db.fullLengths.map(f => f.provider).filter(Boolean)])]);
  updateFLPreview();
  document.getElementById('flDeleteBar').classList.remove('show');
  document.getElementById('flDeleteTrigger').style.display = 'none';
  document.getElementById('flMistakeInfo').style.display = 'none';
  document.getElementById('flModal').classList.add('open');
}

function openEditFLModal(id) {
  const f = db.fullLengths.find(x => x.id === id);
  if (!f) return;
  editingFLId = id;
  document.getElementById('flModalTitle').textContent = 'Edit Full-Length';
  document.getElementById('fl-date').value = f.date || '';
  document.getElementById('fl-provider').value = f.provider || '';
  document.getElementById('fl-name').value = f.name || '';
  SECTIONS.forEach(sec => { document.getElementById(`fl-${sec.key}`).value = f[sec.key]; });
  document.getElementById('fl-notes').value = f.notes || '';
  fillDatalist('flProviderOptions', [...new Set([...FL_PROVIDERS, ...db.fullLengths.map(x => x.provider).filter(Boolean)])]);
  updateFLPreview();
  document.getElementById('flDeleteBar').classList.remove('show');
  document.getElementById('flDeleteTrigger').style.display = 'inline-block';
  const tagged = db.mistakes.filter(m => (m.tags || []).includes(f.name || 'Full-length')).length;
  const info = document.getElementById('flMistakeInfo');
  info.style.display = 'flex';
  info.innerHTML = `<span>📝 ${tagged ? `${plural(tagged, 'mistake')} logged from this exam` : 'Review this exam question by question'}</span>
    <span class="smi-actions">${tagged ? `<button type="button" class="filter-clear-btn" onclick="closeModal('flModal');openMistakesFiltered({ tag: ${jsArg(f.name || 'Full-length')} })">View</button>` : ''}
    <button type="button" class="filter-clear-btn" onclick="logMistakeFromFL()">+ Log a mistake</button></span>`;
  document.getElementById('flModal').classList.add('open');
}

function readFLScores() {
  const scores = {};
  SECTIONS.forEach(sec => { scores[sec.key] = parseInt(document.getElementById(`fl-${sec.key}`).value, 10); });
  return scores;
}

function updateFLPreview() {
  const el = document.getElementById('flLivePreview');
  const scores = readFLScores();
  const vals = Object.values(scores);
  if (vals.some(v => isNaN(v))) { el.className = 'live-preview'; el.textContent = ''; return; }
  if (vals.some(v => v < 118 || v > 132)) {
    el.className = 'live-preview low';
    el.innerHTML = '⚠️ <strong>Each section must be between 118 and 132</strong>';
    return;
  }
  const total = vals.reduce((a, b) => a + b, 0);
  const status = getFLStatus(total);
  const target = Number(db.settings.targetScore);
  const cls = status === 'neutral' ? 'high' : status;
  const detail = target ? `${total >= target ? '+' : ''}${total - target} vs. target ${target}` : 'Set a target score in settings to compare';
  el.className = `live-preview ${cls}`;
  el.innerHTML = `🎯 <strong>Total: ${total}</strong> &nbsp;·&nbsp; <span style="font-weight:400;opacity:0.8">${detail}</span>`;
}

// ═══════════════════════════════════
// SAVE / DELETE
// ═══════════════════════════════════
function saveFL() {
  const date = document.getElementById('fl-date').value;
  const provider = document.getElementById('fl-provider').value.trim();
  const name = document.getElementById('fl-name').value.trim();
  const notes = document.getElementById('fl-notes').value.trim();
  const scores = readFLScores();

  if (!date || !provider) { showToast('Please fill in Date and Provider'); return; }
  if (Object.values(scores).some(v => isNaN(v) || v < 118 || v > 132)) { showToast('Each section score must be between 118 and 132'); return; }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const prevBest = db.fullLengths.filter(f => f.id !== editingFLId).map(getFLTotal);
  const fields = { date, provider, name, notes, ...scores };

  if (editingFLId) {
    const f = db.fullLengths.find(x => x.id === editingFLId);
    if (f) Object.assign(f, fields);
    showToast('Exam updated ✓');
  } else {
    db.fullLengths.push({ id: newId('FL'), createdAt: Date.now(), ...fields });
    if (prevBest.length && total > Math.max(...prevBest)) {
      launchConfetti();
      showToast(`🎉 New personal best — ${total}!`);
    } else {
      showToast(`Exam saved — ${total} ✓`);
    }
  }
  saveDB();
  closeModal('flModal');
  refreshAll();
}

function confirmDeleteFL() {
  if (!editingFLId) return;
  const idx = db.fullLengths.findIndex(f => f.id === editingFLId);
  if (idx < 0) return;
  const [removed] = db.fullLengths.splice(idx, 1);
  saveDB();
  closeModal('flModal');
  refreshAll();
  showToast('Exam deleted', 'Undo', () => {
    db.fullLengths.splice(idx, 0, removed); saveDB(); refreshAll(); showToast('Restored ✓');
  });
}

// Log a mistake straight from a full-length review
function logMistakeFromFL() {
  const f = db.fullLengths.find(x => x.id === editingFLId);
  if (!f) return;
  closeModal('flModal');
  openAddMistakeModal({ provider: f.provider, date: f.date, tags: [f.name || 'Full-length'], flName: f.name || f.provider });
}
