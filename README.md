# MCAT Prep Tracker

Track MCAT practice across all four sections. Log **what went wrong** on every miss, review your mistakes with spaced repetition, and see analytics by **MCAT section**, **subject**, and **question provider** (Jack Westin, Khan Academy, UWorld, AAMC, Blueprint, Kaplan, and others). It uses the same look as Helping Hands: the gold and cream palette, Playfair Display with DM Sans, a dark topbar, and dark mode.

## Getting around

Everything is grouped behind four buttons at the top:

| Button | What's inside |
| --- | --- |
| 🏠 **Home** | Big buttons for your daily actions, today's progress, and top priorities |
| 📝 **Daily Log** | ✏️ New Entry · 📅 Log History · 🧪 Full-Lengths |
| 🔁 **Review** | Review Queue · All Mistakes · Patterns |
| 📈 **Progress** | Analytics · Content Checklist |

## Log a Passage: one button for everything

Every "log" button opens the same screen. At the top, choose:
- **📝 Log a passage / set**: score, time, link, plus every question you missed (below)
- **❌ Just log a mistake**: one question, no score needed (e.g. from a full-length review)

For a passage or set:

1. **What did you do?** Fill in the date, section, subject, and provider, the passage or set name, and **links to the passage** (add as many as you like). Then enter the number of questions, how many you got right, and the minutes it took.
2. **Questions you missed.** A card appears for every miss. On each card, record:
   - the question
   - **the answer you picked**
   - **the correct answer**
   - **what went wrong** (15 error types, each with a fix-it tip)
   - the concept
   - an optional link to that exact question
   - what happened
   - your takeaway
   - an Anki flag

   You can also add lucky guesses.
3. **Reflection.** Optional notes on how it went.

A live sidebar shows your accuracy, pace vs. test pace, how many misses you've explained, and anything still missing. Drafts save automatically, so closing the tab won't lose your work. **Log History** shows every entry grouped by day, with links you can click and each miss listed inline. Click an entry to edit it; review history is kept.

## 🔬 Deep Dive analytics (Progress → Deep Dive)
- **What the Numbers Say**: findings written for you. Examples: best and worst weekday, whether rushing or going slow costs points, fatigue in long sets, whether you lean toward one answer letter, and week-over-week momentum.
- **Momentum**: rolling 7-day accuracy plus daily volume over the last 60 days.
- **Pace vs. Accuracy** scatter (every timed set, compared with real test pace).
- **Fatigue**: accuracy by set length.
- **Weekday Rhythm**: accuracy by day of the week.
- **Answer-Choice Habits**: the letters you pick wrong vs. the letters that were correct.
- **Score Spread**: how your sets are distributed by accuracy.
- **Provider × Section**: an accuracy grid; click a cell to see those passages.
- Filter by period and section; the KPIs show 7-day accuracy, questions per study day, consistency, and your best day.

## Pages

### 🏠 Home dashboard
- **Today strip**: your study streak, a weekly question-goal ring with a bar for each day, the review queue, and your score outlook (predicted score, percentile, test-day projection).
- **Coach's Notes**: plain-English insights generated from your data. Examples: "CARS dropped 7 pts in two weeks", "47% of your misses are avoidable", "You've missed *Enzyme kinetics* 4 times". Each note has a one-click action.
- **Section Snapshot**: accuracy and a 14-day sparkline for each section, plus what kind of errors dominate there.
- **Study Activity**: a GitHub-style calendar heatmap covering the last 26 weeks, with streak and consistency stats.
- **Milestones**: 23 unlockable badges, from 100 questions up to the 520 Club.

### 📚 Practice Log
Log each set with section, subject, provider, topic, questions, number correct, and minutes. Each card shows how many of that set's misses you've logged. When you save a set that has misses, **"What went wrong?"** opens right away (you can turn this off in Settings).

### 📝 Mistake Journal: what went wrong
- **15 error types in 6 root-cause buckets**:
  - **Knowledge**: content gap, forgot/couldn't recall
  - **Reasoning**: data/graph interpretation, logic, research design/stats
  - **Execution**: misread question, misread passage/figure, calculation error, careless
  - **Strategy**: fell for distractor, narrowed to 2 and picked wrong, changed right → wrong, out of scope/too extreme
  - **Timing**: rushed/out of time
  - **Lucky guesses**: you got it right but weren't sure

  Every error type comes with a specific fix-it strategy.
- **Quick log**: log every miss from a set in one screen. Tap an error type to fill the next row, then add the concept, what happened, and your takeaway.
- **Detailed log**: record your answer vs. the correct one, what the question was asking (this becomes your review prompt), tags, and a flag for Anki.
- An **unlogged misses** banner lists the sets you haven't debriefed yet.
- You can filter by root cause, status (due/new/learning/mastered/Anki), section, and period, and search everything.
- **Export to Anki**: a tab-separated file you bring in with File → Import. You can also export to CSV.

### 🔍 What Went Wrong (mistake insights)
- **Your Playbook** shows your top three error types and exactly how to fix each one.
- Charts:
  - error types
  - a root-cause donut
  - root cause by section
  - mistakes per week by root cause
- A **Provider × Root Cause** heatmap and a **Repeat Offenders** table of concepts you keep missing.
- Clicking any bar, slice, cell, or row opens the matching mistakes.

### 🔁 Review Queue
Each mistake becomes a flashcard scheduled with SM-2 spaced repetition:
- Press **Space** to reveal the answer, then **1–4** to grade it Again, Hard, Good, or Easy.
- Each grade button shows when you'll see the card next.
- A card counts as mastered once its review interval reaches 21 days.
- The page also has a daily review goal, your retention rate, a 14-day forecast, and a "review ahead" option.

### 🧪 Full-Length Exams
Track scaled scores for every exam. The **Score Outlook** card shows:
- a predicted score from a weighted average of your last 3 exams (recent and AAMC exams count more)
- an approximate percentile
- your trend in points per week
- a test-day projection
- when you're on pace to hit your target
- your predicted score by section, with the biggest lever highlighted

The score-trend chart extends to test day. You can log mistakes straight from an exam.

### 📊 Analytics
Accuracy and pace by section, subject, or provider, with drill-downs. A drill-down now includes **What Went Wrong Here**, the error breakdown for that slice.

### 🗺️ Content Tracker
126 high-yield topics, organized by subject. Mark each one Not Started, Learning, Reviewed, or Confident. Each topic links to the mistakes you've logged on it, and **Weak spots** shows topics with 2+ mistakes that you haven't marked Confident yet.

## Power tools
- **⌘K / Ctrl+K command palette**: jump to any page, run any action, or search your concepts and the content outline.
- **⏱ Study timer**:
  - **Timed set** mode runs at real test pace and warns you when you fall behind. Finish & log pre-fills your practice set.
  - **Focus 25/5** mode is a Pomodoro timer with a chime.
  - The timer keeps running if you reload the page.
- **🖨 Study Report**: a one-page printable summary (Save as PDF) to share with a tutor or advisor.
- **Undo** after deleting a set, mistake, or exam.

## Keyboard shortcuts
| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Command palette |
| `H` `L` `M` `W` `R` `F` `A` `C` | Home · Log · Mistakes · What went wrong · Review · Full-lengths · Analytics · Content |
| `N` | New entry (set, mistake, or exam depending on the page) |
| `E` | Log a mistake |
| `T` | Study timer |
| `P` | Print study report |
| `/` | Search |
| `D` | Dark mode |
| `Space`, `1–4` | Reveal and grade on the Review page |
| `?` | Show shortcuts |

## Using it

Open `index.html` in a browser, or turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

Data is saved in your browser's `localStorage`. Data from the earlier version is migrated automatically. Use **⚙️ Settings** to:
- set your test date, target score, target accuracy, weekly question goal, and daily review goal
- **download or restore a JSON backup** (do this regularly, especially when switching devices)
- load eight weeks of realistic sample data to explore, or clear everything

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Pages, modals, timer panel, command palette |
| `style.css` | Theme, matching Helping Hands |
| `core.js` | Data store and migration, MCAT constants, error taxonomy, helpers, settings, backups |
| `charts.js` | Chart palette, defaults, weekly bucketing |
| `content.js` | High-yield content outline and the Content Tracker |
| `practice.js` | Practice log: CRUD, filters, mistake-logging status, CSV |
| `mistakes.js` | Mistake journal: detailed and quick log, filters, Anki and CSV export |
| `review.js` | Spaced repetition scheduling and the flashcard review page |
| `insights.js` | What Went Wrong analytics and the insights engine |
| `fullLengths.js` | Full-length exams, score outlook, projection, percentiles |
| `analytics.js` | Section, subject, and provider analytics with drill-downs |
| `home.js` | Dashboard: streak, weekly goal, heatmap, section snapshot |
| `achievements.js` | Milestones |
| `timer.js` | Study timer (timed sets and focus blocks) |
| `palette.js` | Command palette |
| `report.js` | Printable study report |
| `sample.js` | Sample data generator |
| `navigation.js` | Page switching, shortcuts, clock, startup |
