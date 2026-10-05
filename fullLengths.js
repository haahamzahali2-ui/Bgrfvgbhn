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
// RENDER — page entry point
// ═══════════════════════════════════
function renderFullLengths() {
  renderTopbarStats();
  const fls = getSortedFLs();
  const countEl = document.getElementById('flCountLabel');
  if (countEl) countEl.textContent = `${fls.length} exam${fls.length !== 1 ? 's' : ''} taken`;

  renderFLKPIs(fls);
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
    if (target) {
      datasets.push({
        label: `Target (${target})`, data: fls.map(() => target),
        borderColor: 'rgba(46,125,82,0.7)', borderDash: [6, 6], borderWidth: 2, pointRadius: 0, fill: false
      });
    }
    const vals = fls.map(getFLTotal).concat(target ? [target] : []);
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
      plugins: { legend: { display: flChartMode === 'sections' || !!target } }
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
    return `<div class="session-card fl-card ${status}" onclick="openEditFLModal('${escapeHtml(f.id)}')">
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
  db.fullLengths = db.fullLengths.filter(f => f.id !== editingFLId);
  saveDB();
  closeModal('flModal');
  refreshAll();
  showToast('Exam deleted');
}
