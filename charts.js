// ═══════════════════════════════════
// CHARTS — shared palette, defaults, and time bucketing
// ═══════════════════════════════════

const goldPalette = {
  gold: '#C9A84C', goldDim: '#A8893C', goldLight: '#E8D5A3',
  red: '#C0392B', amber: '#D4850A', green: '#2E7D52',
  text: '#5C4F38', grid: '#E8D9B8'
};

function isDarkMode() { return document.body.classList.contains('dark-mode'); }

function chartTextColor() { return isDarkMode() ? '#C8B98A' : goldPalette.text; }
function chartGridColor() { return isDarkMode() ? '#3A3020' : goldPalette.grid; }

function getChartDefaults() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { family: "'DM Sans', sans-serif", size: 13 }, color: chartTextColor(), boxWidth: 14 } },
      tooltip: { backgroundColor: '#1A1208', titleFont: { family: "'Playfair Display', serif", size: 15 }, bodyFont: { family: "'DM Sans', sans-serif", size: 13 }, padding: 14, cornerRadius: 10 }
    },
    scales: {
      x: { ticks: { font: { family: "'DM Sans'", size: 11 }, color: chartTextColor(), maxRotation: 35 }, grid: { color: chartGridColor() } },
      y: { ticks: { font: { family: "'DM Sans'", size: 12 }, color: chartTextColor() }, grid: { color: chartGridColor() } }
    }
  };
}

// Deep-ish merge for chart option objects
function mergeOptions(base, extra) {
  const out = { ...base };
  for (const k in extra) {
    const v = extra[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object')
      ? mergeOptions(base[k], v)
      : v;
  }
  return out;
}

function accuracyColor(acc, alpha = 0.8) {
  const cls = getAccuracyClass(acc);
  if (cls === 'high') return `rgba(46,125,82,${alpha})`;
  if (cls === 'medium') return `rgba(212,133,10,${alpha})`;
  return `rgba(192,57,43,${alpha})`;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ═══════════════════════════════════
// WEEKLY BUCKETS — Monday-start weeks
// ═══════════════════════════════════
function weekStartISO(iso) {
  const d = parseLocalDate(iso);
  if (!d) return '';
  const day = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatWeekLabel(iso) {
  const d = parseLocalDate(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : iso;
}

// Every week between the first and last session, so gaps show as gaps
function getWeekRange(sessions) {
  const weeks = [...new Set(sessions.map(s => weekStartISO(s.date)).filter(Boolean))].sort();
  if (!weeks.length) return [];
  const out = [];
  const cur = parseLocalDate(weeks[0]);
  const end = parseLocalDate(weeks[weeks.length - 1]);
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function weeklySeries(sessions, weeks) {
  const buckets = {};
  sessions.forEach(s => {
    const w = weekStartISO(s.date);
    if (!buckets[w]) buckets[w] = { q: 0, c: 0 };
    buckets[w].q += Number(s.total) || 0;
    buckets[w].c += Number(s.correct) || 0;
  });
  return {
    accuracy: weeks.map(w => buckets[w] && buckets[w].q ? pct(buckets[w].c, buckets[w].q) : null),
    questions: weeks.map(w => buckets[w] ? buckets[w].q : 0)
  };
}
