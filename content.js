// ═══════════════════════════════════
// CONTENT TRACKER — high-yield MCAT topic outline, status, links to mistakes
// ═══════════════════════════════════

// Condensed from the AAMC content categories — the topics that show up most.
const CONTENT_TOPICS = {
  'Biology': [
    'Cell structure & organelles', 'Membrane transport', 'Cell cycle & mitosis', 'Meiosis & genetic variation',
    'Mendelian genetics & pedigrees', 'Population genetics & Hardy-Weinberg', 'Evolution & natural selection',
    'DNA replication & repair', 'Transcription & RNA processing', 'Translation', 'Gene regulation',
    'Biotechnology (PCR, blotting, cloning)', 'Viruses & bacteria', 'Embryology & development',
    'Neurons & action potentials', 'Nervous system organization', 'Endocrine system', 'Cardiovascular system',
    'Respiratory system', 'Immune system', 'Digestive system', 'Renal system', 'Musculoskeletal system',
    'Reproductive system', 'Skin & thermoregulation'
  ],
  'Biochemistry': [
    'Amino acids', 'Protein structure & folding', 'Enzyme kinetics', 'Enzyme inhibition & regulation',
    'Carbohydrates', 'Lipids & membranes', 'Nucleotides & nucleic acids', 'Glycolysis', 'Gluconeogenesis',
    'Glycogen metabolism', 'Pentose phosphate pathway', 'Citric acid cycle', 'Electron transport & ox-phos',
    'Fatty acid metabolism', 'Amino acid metabolism & urea cycle', 'Hormonal regulation of metabolism',
    'Bioenergetics', 'Protein purification & lab techniques'
  ],
  'General Chemistry': [
    'Atomic structure & quantum numbers', 'Periodic trends', 'Bonding & molecular geometry',
    'Intermolecular forces', 'Stoichiometry', 'Gas laws', 'Thermochemistry', 'Kinetics & rate laws',
    'Equilibrium & Le Châtelier', 'Acids & bases', 'Buffers & titrations', 'Solubility & Ksp',
    'Electrochemistry', 'Redox reactions', 'Solutions & colligative properties'
  ],
  'Organic Chemistry': [
    'Nomenclature & functional groups', 'Isomers & stereochemistry', 'Hybridization & resonance',
    'Alcohols & ethers', 'Aldehydes & ketones', 'Carboxylic acids', 'Carboxylic acid derivatives',
    'Amines & amino acid synthesis', 'Substitution reactions (SN1/SN2)', 'Separations & purification',
    'Spectroscopy (IR, NMR, MS)', 'Aromatic compounds & phenols'
  ],
  'Physics': [
    'Units & kinematics', 'Forces & Newton\'s laws', 'Work, energy & power', 'Momentum & collisions',
    'Fluid statics', 'Fluid dynamics', 'Electrostatics', 'Circuits', 'Magnetism', 'Waves & sound',
    'Mirrors & lenses', 'Light & electromagnetic radiation', 'Thermodynamics', 'Atomic & nuclear phenomena'
  ],
  'Research & Stats': [
    'Experimental design', 'Variables & controls', 'Validity & reliability', 'Descriptive statistics',
    'Inferential statistics & p-values', 'Correlation vs. causation', 'Research ethics', 'Reading graphs & figures'
  ],
  'Psychology': [
    'Sensation & perception', 'Consciousness & sleep', 'Memory', 'Learning (classical & operant)',
    'Cognition & problem solving', 'Language', 'Emotion & stress', 'Motivation', 'Personality theories',
    'Psychological disorders', 'Development (Piaget, Erikson, Kohlberg)', 'Biological bases of behavior',
    'Attitudes & behavior change', 'Social cognition & attribution', 'Group processes & conformity'
  ],
  'Sociology': [
    'Sociological theories', 'Social institutions', 'Culture & socialization', 'Demographics & migration',
    'Social stratification & inequality', 'Health disparities', 'Self-concept & identity',
    'Social interaction & impression management', 'Prejudice & discrimination', 'Social movements & change'
  ],
  'CARS': [
    'Main idea & author\'s purpose', 'Author\'s tone & attitude', 'Foundations of comprehension',
    'Reasoning within the text', 'Reasoning beyond the text', 'Strengthen / weaken questions',
    'Passage mapping', 'Humanities passages', 'Social science passages'
  ]
};

const CONTENT_STATUS = [
  { val: 0, key: 'none',      label: 'Not Started' },
  { val: 1, key: 'learning',  label: 'Learning' },
  { val: 2, key: 'reviewed',  label: 'Reviewed' },
  { val: 3, key: 'confident', label: 'Confident' }
];

// Subjects map to topic groups; all CARS subjects share the CARS list
function topicGroupFor(subject) {
  if (!subject) return null;
  if (subject.startsWith('CARS')) return 'CARS';
  return CONTENT_TOPICS[subject] ? subject : null;
}

function getTopicsForSubject(subject) {
  const group = topicGroupFor(subject);
  return group ? CONTENT_TOPICS[group] : [];
}

function getAllTopics() { return Object.values(CONTENT_TOPICS).flat(); }

function topicKey(group, topic) { return `${group}::${topic}`; }
function getTopicStatus(group, topic) { return db.contentStatus[topicKey(group, topic)] || 0; }

// Mistakes whose concept matches a topic (case-insensitive)
function countMistakesByConcept() {
  const counts = {};
  db.mistakes.forEach(m => {
    const k = (m.concept || '').trim().toLowerCase();
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

// ═══════════════════════════════════
// RENDER
// ═══════════════════════════════════
let contentSearchTerm = '';
let contentFilter = 'all'; // 'all' | 'weak' | 'none' | 'learning' | 'reviewed' | 'confident'
let contentOpenGroups = new Set(['Biochemistry']);

function renderContentTracker() {
  renderTopbarStats();
  const counts = countMistakesByConcept();
  const groups = Object.keys(CONTENT_TOPICS);
  const all = groups.flatMap(g => CONTENT_TOPICS[g].map(t => ({ group: g, topic: t, status: getTopicStatus(g, t) })));
  const byStatus = [0, 1, 2, 3].map(v => all.filter(x => x.status === v).length);
  const weak = all.filter(x => (counts[x.topic.toLowerCase()] || 0) >= 2 && x.status < 3);

  document.getElementById('contentKPIs').innerHTML = `
    <div class="analytics-kpi green">
      <div class="kpi-val green">${pct(byStatus[3], all.length)}%</div>
      <div class="kpi-label">Confident</div>
      <div class="kpi-sub">${byStatus[3]} of ${all.length} topics</div>
    </div>
    <div class="analytics-kpi gold">
      <div class="kpi-val gold">${pct(byStatus[2] + byStatus[3], all.length)}%</div>
      <div class="kpi-label">Reviewed+</div>
      <div class="kpi-sub">content pass coverage</div>
    </div>
    <div class="analytics-kpi amber">
      <div class="kpi-val amber">${byStatus[0]}</div>
      <div class="kpi-label">Not Started</div>
      <div class="kpi-sub">${byStatus[1]} in progress</div>
    </div>
    <div class="analytics-kpi red" style="cursor:pointer" onclick="setContentFilter('weak', document.querySelector('#contentFilterChips [data-f=weak]'))">
      <div class="kpi-val red">${weak.length}</div>
      <div class="kpi-label">Weak Spots</div>
      <div class="kpi-sub">2+ mistakes, not yet confident</div>
    </div>
  `;

  const q = contentSearchTerm.toLowerCase();
  const wrap = document.getElementById('contentGroups');
  wrap.innerHTML = groups.map(g => {
    const topics = CONTENT_TOPICS[g].map(t => ({ topic: t, status: getTopicStatus(g, t), misses: counts[t.toLowerCase()] || 0 }));
    const shown = topics.filter(x => {
      if (q && !x.topic.toLowerCase().includes(q) && !g.toLowerCase().includes(q)) return false;
      if (contentFilter === 'weak') return x.misses >= 2 && x.status < 3;
      if (contentFilter !== 'all') return CONTENT_STATUS[x.status].key === contentFilter;
      return true;
    });
    if (!shown.length && (q || contentFilter !== 'all')) return '';
    const segs = [3, 2, 1].map(v => ({ v, n: topics.filter(x => x.status === v).length }));
    const confident = segs[0].n;
    const misses = topics.reduce((a, x) => a + x.misses, 0);
    const open = contentOpenGroups.has(g) || !!q || contentFilter !== 'all';
    return `<div class="content-group ${open ? 'open' : ''}">
      <div class="content-group-head" onclick="toggleContentGroup(${jsArg(g)})">
        <div class="content-group-name">${escapeHtml(g)}</div>
        <div class="content-progress" title="${confident} confident of ${topics.length}">
          ${segs.map(s => `<span class="cp-seg s${s.v}" style="width:${(s.n / topics.length) * 100}%"></span>`).join('')}
        </div>
        <div class="content-group-meta">${confident}/${topics.length} confident${misses ? ` · <span class="content-miss-count">${plural(misses, 'mistake')}</span>` : ''}</div>
        <div class="content-group-chevron">⌄</div>
      </div>
      <div class="content-topic-list">
        ${shown.map(x => `<div class="content-topic-row">
          <div class="content-topic-name">${escapeHtml(x.topic)}
            ${x.misses ? `<button class="content-topic-misses ${x.misses >= 2 ? 'hot' : ''}" onclick="openMistakesFiltered({ concept: ${jsArg(x.topic)} })">${plural(x.misses, 'mistake')}</button>` : ''}
          </div>
          <div class="content-status-seg">
            ${CONTENT_STATUS.map(s => `<button class="${x.status === s.val ? 'active s' + s.val : ''}" onclick="setTopicStatus(${jsArg(g)}, ${CONTENT_TOPICS[g].indexOf(x.topic)}, ${s.val})">${s.label}</button>`).join('')}
          </div>
        </div>`).join('') || '<div class="table-empty" style="padding:16px">No matching topics</div>'}
      </div>
    </div>`;
  }).join('') || `<div class="patients-empty-state"><div class="patients-empty-icon">🔍</div><div class="patients-empty-title">No topics match</div></div>`;
}

function toggleContentGroup(g) {
  if (contentOpenGroups.has(g)) contentOpenGroups.delete(g); else contentOpenGroups.add(g);
  renderContentTracker();
}

function setTopicStatus(group, idx, val) {
  const topic = CONTENT_TOPICS[group][idx];
  const k = topicKey(group, topic);
  if (val === 0) delete db.contentStatus[k]; else db.contentStatus[k] = val;
  saveDB();
  if (typeof checkAchievements === 'function') checkAchievements();
  renderContentTracker();
}

function setContentFilter(f, btn) {
  contentFilter = f;
  setActiveChip(btn);
  renderContentTracker();
}

function filterContentTopics() {
  contentSearchTerm = document.getElementById('contentSearch').value.trim();
  renderContentTracker();
}

function expandAllContent(open) {
  contentOpenGroups = open ? new Set(Object.keys(CONTENT_TOPICS)) : new Set();
  renderContentTracker();
}
