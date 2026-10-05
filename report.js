// ═══════════════════════════════════
// STUDY REPORT — one printable page (Save as PDF) summarizing everything:
// share it with a tutor, advisor, or study group
// ═══════════════════════════════════

function printStudyReport() {
  const el = document.getElementById('printReport');
  const sum = summarizeSessions(db.sessions);
  const outlook = computeScoreOutlook();
  const fls = getSortedFLs();
  const streak = getStreak();
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const daysLeft = getDaysUntilTest();
  const byType = countBy(db.mistakes, m => m.errorType);
  const typeKeys = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
  const byBucket = countBy(db.mistakes, m => getErrorType(m.errorType).bucket);
  const repeat = getRepeatOffenders(db.mistakes).filter(r => r.count >= 2).slice(0, 8);
  const providers = computeGroupStats(db.sessions, 'provider');
  const avoidable = db.mistakes.filter(m => AVOIDABLE_BUCKETS.includes(getErrorType(m.errorType).bucket)).length;
  const insights = generateInsights().slice(0, 6);
  const strip = html => html.replace(/<[^>]+>/g, '');

  el.innerHTML = `
    <div class="rp-head">
      <div>
        <div class="rp-title">MCAT Prep — Study Report</div>
        <div class="rp-sub">Generated ${dateStr}${daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft} days until test day (${formatDateShort(db.settings.testDate)})` : ''}${db.settings.targetScore ? ` · Target ${db.settings.targetScore}` : ''}</div>
      </div>
      <div class="rp-logo">MC</div>
    </div>

    <div class="rp-kpis">
      <div><b>${sum.questions.toLocaleString()}</b><span>Questions</span></div>
      <div><b>${sum.questions ? sum.accuracy + '%' : '—'}</b><span>Accuracy</span></div>
      <div><b>${Math.round(sum.minutes / 60)}</b><span>Hours timed</span></div>
      <div><b>${db.mistakes.length}</b><span>Mistakes logged</span></div>
      <div><b>${outlook ? outlook.predicted : '—'}</b><span>Predicted score</span></div>
      <div><b>${streak.longest}</b><span>Longest streak</span></div>
    </div>

    <h3>By MCAT Section</h3>
    <table class="rp-table">
      <thead><tr><th>Section</th><th>Questions</th><th>Accuracy</th><th>Pace / Q</th><th>Mistakes</th><th>Top root cause</th><th>Latest FL</th><th>Predicted</th></tr></thead>
      <tbody>${SECTIONS.map(sec => {
        const st = summarizeSessions(db.sessions.filter(s => s.section === sec.key));
        const ms = db.mistakes.filter(m => m.section === sec.key);
        const b = countBy(ms, m => getErrorType(m.errorType).bucket);
        const top = Object.keys(b).sort((x, y) => b[y] - b[x])[0];
        return `<tr><td><b>${sec.name}</b></td><td>${st.questions}</td><td>${st.questions ? st.accuracy + '%' : '—'}</td><td>${formatPace(st.secPerQ)}</td>
          <td>${ms.length}</td><td>${top ? `${getBucket(top).label} (${pct(b[top], ms.length)}%)` : '—'}</td>
          <td>${fls.length ? fls[fls.length - 1][sec.key] : '—'}</td><td>${outlook ? outlook.sections[sec.key].toFixed(1) : '—'}</td></tr>`;
      }).join('')}</tbody>
    </table>

    <div class="rp-cols">
      <div>
        <h3>What Went Wrong</h3>
        ${db.mistakes.length ? `
        <p class="rp-note">${pct(avoidable, db.mistakes.length)}% of logged misses were avoidable (execution, strategy, timing). ${ERROR_BUCKETS.filter(b => byBucket[b.key]).map(b => `${b.label} ${pct(byBucket[b.key], db.mistakes.length)}%`).join(' · ')}</p>
        <table class="rp-table">
          <thead><tr><th>Error type</th><th>Count</th><th>Share</th></tr></thead>
          <tbody>${typeKeys.slice(0, 8).map(k => `<tr><td>${getErrorType(k).icon} ${escapeHtml(getErrorType(k).label)}</td><td>${byType[k]}</td><td>${pct(byType[k], db.mistakes.length)}%</td></tr>`).join('')}</tbody>
        </table>` : '<p class="rp-note">No mistakes logged yet.</p>'}
      </div>
      <div>
        <h3>By Provider</h3>
        <table class="rp-table">
          <thead><tr><th>Provider</th><th>Questions</th><th>Accuracy</th></tr></thead>
          <tbody>${providers.slice(0, 8).map(p => `<tr><td>${escapeHtml(p.key)}</td><td>${p.questions}</td><td>${p.accuracy}%</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    ${repeat.length ? `<h3>Repeat Offenders</h3>
    <table class="rp-table">
      <thead><tr><th>Concept</th><th>Subject</th><th>Times missed</th><th>Main error</th><th>Mastered</th></tr></thead>
      <tbody>${repeat.map(r => `<tr><td><b>${escapeHtml(r.concept)}</b></td><td>${escapeHtml(r.subject)}</td><td>${r.count}</td><td>${escapeHtml(getErrorType(r.topType).label)}</td><td>${r.mastered}/${r.count}</td></tr>`).join('')}</tbody>
    </table>` : ''}

    ${fls.length ? `<h3>Full-Length History</h3>
    <table class="rp-table">
      <thead><tr><th>Date</th><th>Exam</th><th>C/P</th><th>CARS</th><th>B/B</th><th>P/S</th><th>Total</th></tr></thead>
      <tbody>${fls.map(f => `<tr><td>${formatDateShort(f.date)}</td><td>${escapeHtml(f.name || f.provider)}</td><td>${f.cp}</td><td>${f.cars}</td><td>${f.bb}</td><td>${f.ps}</td><td><b>${getFLTotal(f)}</b></td></tr>`).join('')}</tbody>
    </table>` : ''}

    <h3>Coaching Notes</h3>
    <ul class="rp-insights">${insights.map(i => `<li>${i.icon} ${escapeHtml(strip(i.text))}</li>`).join('')}</ul>
  `;
  document.body.classList.add('printing-report');
  const cleanup = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => { window.print(); setTimeout(cleanup, 1500); }, 50);
}
