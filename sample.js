// ═══════════════════════════════════
// SAMPLE DATA — eight weeks of realistic prep so every page has something to show.
// Deterministic pseudo-random so it looks the same every time.
// ═══════════════════════════════════

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

const SAMPLE_PLAN = [
  ['cp', 'General Chemistry', 'UWorld', 'Acids & bases'],
  ['cp', 'Physics', 'Khan Academy', 'Fluid dynamics'],
  ['cp', 'Organic Chemistry', 'Blueprint', 'Aldehydes & ketones'],
  ['cp', 'Biochemistry', 'AAMC', 'C/P Section Bank'],
  ['cp', 'Physics', 'UWorld', 'Circuits'],
  ['cars', 'CARS — Humanities', 'Jack Westin', 'Daily CARS passage'],
  ['cars', 'CARS — Social Sciences', 'Jack Westin', 'Daily CARS passage'],
  ['cars', 'CARS — Mixed', 'AAMC', 'CARS Question Pack Vol. 1'],
  ['cars', 'CARS — Mixed', 'UWorld', 'CARS block'],
  ['bb', 'Biology', 'UWorld', 'Endocrine system'],
  ['bb', 'Biochemistry', 'Khan Academy', 'Enzyme kinetics'],
  ['bb', 'Biochemistry', 'AAMC', 'B/B Section Bank'],
  ['bb', 'Biology', 'Kaplan', 'Mendelian genetics & pedigrees'],
  ['ps', 'Psychology', 'Khan Academy', 'Memory'],
  ['ps', 'Sociology', 'UWorld', 'Social stratification & inequality'],
  ['ps', 'Psychology', 'AAMC', 'P/S Section Bank'],
  ['ps', 'Research & Stats', 'Blueprint', 'Experimental design']
];

// Error-type mix differs by section, the way it does for real students
const SAMPLE_ERROR_WEIGHTS = {
  cp:   { content: 5, recall: 3, math: 4, data: 3, misread_q: 2, careless: 2, reasoning: 2, timing: 2, distractor: 1, guess: 1 },
  cars: { scope: 5, distractor: 4, narrowed: 5, reasoning: 3, misread_p: 3, changed: 2, timing: 2, guess: 1 },
  bb:   { content: 5, recall: 4, data: 3, research: 2, misread_p: 2, reasoning: 2, careless: 1, narrowed: 1, guess: 1 },
  ps:   { recall: 5, content: 4, research: 3, distractor: 2, narrowed: 2, misread_q: 1, careless: 1, guess: 1 }
};

const SAMPLE_NOTES = {
  content:    [['Didn\'t know this mechanism at all', 'Re-learn from content review; make Anki cards'], ['Never learned the formula', 'Write the equation + units on a card']],
  recall:     [['Knew it once, blanked on test', 'Spaced review until automatic'], ['Mixed up two similar terms', 'Make a side-by-side comparison card']],
  math:       [['Dropped a power of ten', 'Use scientific notation, check magnitude'], ['Rounded too early', 'Round only at the last step']],
  data:       [['Misread the y-axis units', 'Read axes + units before anything else'], ['Ignored the control group in the figure', 'Always compare to control first']],
  misread_q:  [['Missed the word EXCEPT', 'Circle NOT/EXCEPT/LEAST'], ['Answered a different question than asked', 'Re-read the stem before choosing']],
  misread_p:  [['Skimmed past the key qualifier', 'Re-find the exact line before answering'], ['Confused which experiment was which', 'Label each experiment in my passage map']],
  careless:   [['Clicked B meaning to click C', 'Pause one beat before confirming'], ['Knew it, rushed', 'Final read: does it answer THE question?']],
  reasoning:  [['Assumed a link the passage never made', 'Every step needs evidence'], ['Reversed cause and effect', 'Ask: which variable changed first?']],
  research:   [['Confused IV and DV', 'Name IV / DV / controls first'], ['Thought correlation implied causation', 'No manipulation = no causal claim']],
  distractor: [['Picked the answer that was true but irrelevant', 'True ≠ answers the question'], ['Chose the familiar-sounding term', 'Predict before reading choices']],
  narrowed:   [['Down to B and D, chose wrong', 'Find the one word that differs and test it'], ['Second-to-best answer', 'Pick the one the passage directly supports']],
  changed:    [['Changed from right to wrong', 'Only switch with concrete new evidence']],
  scope:      [['Picked an extreme "always" answer', 'Prefer moderate, supported answers'], ['Answer went beyond the passage', 'Stay inside the author\'s argument']],
  timing:     [['Ran out of time on last passage', 'Triage long passages; flag and move on'], ['Spent 4 min on one calc', 'Skip calcs over 2 min, come back']],
  guess:      [['Guessed between two and got lucky', 'Review until it\'s not a guess']]
};

const SAMPLE_LINKS = {
  'Jack Westin': 'https://jackwestin.com/resources/mcat-cars/daily-passages',
  'Khan Academy': 'https://www.khanacademy.org/test-prep/mcat',
  'AAMC': 'https://students-residents.aamc.org/prepare-mcat-exam/prepare-mcat-exam'
};

const SAMPLE_QUESTIONS = {
  content: 'Which statement best describes the mechanism?', recall: 'Which term matches the description?',
  math: 'What is the approximate value of the quantity?', data: 'Which conclusion is best supported by Figure 1?',
  misread_q: 'Which of the following is NOT consistent with the passage?', misread_p: 'According to the passage, the researchers found…',
  scope: 'The author would most likely agree that…', narrowed: 'Which choice best strengthens the author\'s claim?',
  distractor: 'Which explanation accounts for the result?', research: 'Which change would improve the study\'s validity?'
};

function pickWeighted(weights, rnd) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries[0][0];
}

function loadSampleData() {
  const rnd = seededRandom(20261005);
  const today = todayISO();
  const base = { cp: 0.6, cars: 0.58, bb: 0.66, ps: 0.71 };
  const sets = [], mistakes = [];

  for (let day = 56; day >= 0; day--) {
    if (day % 7 === 3 && day > 0) continue; // a rest day each week
    const date = addDaysISO(today, -day);
    const perDay = 1 + (rnd() < 0.45 ? 1 : 0) + (rnd() < 0.15 ? 1 : 0);
    for (let k = 0; k < perDay; k++) {
      const [section, subject, provider, topic] = SAMPLE_PLAN[Math.floor(rnd() * SAMPLE_PLAN.length)];
      const total = section === 'cars' ? [5, 6, 11, 17][Math.floor(rnd() * 4)] : [10, 15, 20, 25][Math.floor(rnd() * 4)];
      const progress = (56 - day) / 56 * 0.15;
      const acc = Math.min(0.97, Math.max(0.3, base[section] + progress + (rnd() - 0.5) * 0.16));
      const correct = Math.round(total * acc);
      const minutes = Math.round(total * (getTargetPace(section) / 60) * (1.18 - progress) * (0.9 + rnd() * 0.2));
      const id = newId('SET');
      const links = SAMPLE_LINKS[provider] ? [SAMPLE_LINKS[provider]] : [];
      sets.push({ id, createdAt: Date.now() - day * 86400000 + k, date, section, subject, provider, topic, links, total, correct, minutes, notes: '' });

      // Log most misses (older sets more completely), skip some so "unlogged" shows up
      const missed = total - correct;
      const logRate = day > 3 ? 0.85 : 0.4;
      const topics = getTopicsForSubject(subject);
      for (let q = 0; q < missed; q++) {
        if (rnd() > logRate) continue;
        const errorType = pickWeighted(SAMPLE_ERROR_WEIGHTS[section], rnd);
        const notes = SAMPLE_NOTES[errorType] || SAMPLE_NOTES.content;
        const [what, takeaway] = notes[Math.floor(rnd() * notes.length)];
        // Concepts cluster: repeat the set's topic often so "repeat offenders" emerge
        const concept = topics.includes(topic) && rnd() < 0.5 ? topic : topics[Math.floor(rnd() * Math.min(topics.length, 8))] || topic;
        const letters = ['A', 'B', 'C', 'D'];
        const correctAnswer = letters[Math.floor(rnd() * 4)];
        const myAnswer = errorType === 'guess' ? correctAnswer : letters.filter(l => l !== correctAnswer)[Math.floor(rnd() * 3)];
        mistakes.push(normalizeMistake({
          id: newId('MK'), createdAt: Date.now() - day * 86400000 + k * 100 + q, date, section, subject, provider, sessionId: id,
          concept, questionRef: `Q${Math.floor(rnd() * total) + 1}`, question: SAMPLE_QUESTIONS[errorType] || '', what, takeaway,
          errorType, myAnswer, correctAnswer, tags: [], anki: rnd() < 0.25
        }));
      }
    }
  }

  // Simulate the review history you'd have built by doing your reviews most days
  mistakes.forEach(m => {
    let cursor = m.review.due;
    while (cursor < today && rnd() < 0.985) {
      const roll = rnd();
      const grade = roll < 0.12 ? 1 : roll < 0.27 ? 2 : roll < 0.9 ? 3 : 4;
      const next = computeNextReview(m.review, grade);
      m.review.interval = next.interval; m.review.ease = next.ease;
      m.review.reps++; if (grade === 1) m.review.lapses++;
      m.review.history.push({ date: cursor, grade });
      m.review.last = cursor;
      m.review.due = addDaysISO(cursor, next.interval);
      cursor = m.review.due;
    }
  });

  const flPlan = [
    [49, 'Blueprint', 'Blueprint Diagnostic', 124, 123, 125, 126],
    [35, 'AAMC', 'AAMC Unscored Sample', 125, 124, 126, 127],
    [21, 'AAMC', 'AAMC FL 1', 126, 125, 127, 128],
    [7, 'AAMC', 'AAMC FL 2', 127, 126, 128, 129]
  ];
  const fls = flPlan.map(([daysAgo, provider, name, cp, cars, bb, ps]) =>
    ({ id: newId('FL'), createdAt: Date.now(), date: addDaysISO(today, -daysAgo), provider, name, cp, cars, bb, ps, notes: '' }));

  // Some content progress
  Object.keys(CONTENT_TOPICS).forEach(g => CONTENT_TOPICS[g].forEach(t => {
    const r = rnd();
    const v = r < 0.35 ? 3 : r < 0.6 ? 2 : r < 0.8 ? 1 : 0;
    if (v) db.contentStatus[topicKey(g, t)] = v;
  }));

  db.sessions.push(...sets);
  db.mistakes.push(...mistakes);
  db.fullLengths.push(...fls);
  if (!db.settings.testDate) db.settings.testDate = addDaysISO(today, 45);
  if (!db.settings.targetScore) db.settings.targetScore = 515;
  saveDB();
  closeModal('settingsModal');
  refreshAll();
  showToast(`Loaded ${sets.length} sets, ${mistakes.length} mistakes, ${fls.length} exams — clear anytime in ⚙️ Settings`);
}
