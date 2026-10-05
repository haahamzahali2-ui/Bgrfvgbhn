# MCAT Prep Tracker

Track MCAT practice across all four sections. It has analytics by **MCAT section**, **subject**, and **question provider** (Jack Westin, Khan Academy, UWorld, AAMC, Blueprint, Kaplan, and others). It uses the same look as Helping Hands: the gold and cream palette, Playfair Display with DM Sans, a dark topbar, and dark mode.

## Pages

- **Practice Log**: log each question set with date, section, subject, provider, topic, questions, number correct, and minutes. Cards are color-coded against your target accuracy. You can search, filter by section or period, and export to CSV.
- **Full-Length Exams**: record scaled scores for each section (118–132). This page shows:
  - a total and per-section score trend
  - averages and bests by provider and by section
  - confetti when you set a new personal best
- **Analytics** covers three views (By MCAT Section, By Subject, By Provider), each with:
  - KPI cards: questions, accuracy, trend, and pace
  - clickable group cards
  - an accuracy bar chart
  - weekly accuracy-over-time lines
  - **Focus Areas**: your weakest subject and section pairs
  
  Click any section, subject, or provider to drill in. That shows a breakdown by the other two dimensions, a weekly trend, and a sortable table. Click a bar or row to open the matching practice sets.
- **Home** shows the test-day countdown, overall totals, and an accuracy snapshot for each section.

## Using it

Open `index.html` in a browser, or turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

Data is saved in your browser's `localStorage`. Use **⚙️ Settings** to:
- set your test date, target score, and target accuracy
- **download or restore a JSON backup** (do this regularly, especially when switching devices)
- load sample data to try things out, or clear everything

## Keyboard shortcuts

`?` help · `H` home · `L` practice log · `F` full-lengths · `A` analytics · `N` new entry · `/` search · `D` dark mode · `Esc` close

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Pages and modals |
| `style.css` | Theme, matching Helping Hands |
| `core.js` | Data store, MCAT constants, helpers, settings, backups, home stats |
| `charts.js` | Chart palette, defaults, weekly bucketing |
| `practice.js` | Practice log: CRUD, filters, CSV, sample data |
| `fullLengths.js` | Full-length exams: CRUD, trend chart, provider and section tables |
| `analytics.js` | Section, subject, and provider analytics with drill-downs |
| `navigation.js` | Page switching, shortcuts, clock, startup |
