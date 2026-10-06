# MCAT Prep

A dead-simple way to log the MCAT questions you miss, and see why you miss them.

## Log a missed question
1. Paste the **passage link**.
2. Pick the **section** and, if you want, the **score** (e.g. 4 out of 6).
3. Type the **question number** and pick **why you missed it**:
   - Didn't know it
   - Forgot it
   - Misread it
   - Careless mistake
   - Fell for a trap
   - Ran out of time
4. **Save.**

The link, section, and score stay filled in after you save, so logging the next miss from the same passage takes just a question # and a reason. Got everything right? Enter just the score and save. Click **Start a new passage** to clear the form.

## The other tabs
- **History**: everything you've logged, newest first. Search it, click ✎ to edit or ✕ to delete (with undo).
- **Stats**: the reason you miss questions most, a breakdown of every reason, your accuracy, and stats by section.
- **Exams**: add full-length scores (C/P, CARS, B/B, P/S). See your latest, best, and average.

## Keeping your data safe: ⚙️ Settings
Your data saves in your browser automatically. To make sure it never disappears and shows up on every device, connect a **Google Sheet** (one-time, about 5 minutes):

1. Go to [sheets.new](https://sheets.new) to create a new Google Sheet.
2. In the Sheet, open **Extensions → Apps Script**. Delete what's there, paste [`google-apps-script.gs`](google-apps-script.gs) (or use **Copy the script** in Settings), and click **Save**.
3. Click **Deploy → New deployment → ⚙️ Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**.
4. Authorize it: **Advanced → Go to (project) → Allow**.
5. Paste the **Web app URL** (ends in `/exec`) into Settings and click **Connect**.

After that, every save also goes to your Sheet, which gets readable **Entries** and **Exams** tabs. On another device, paste the same URL to load your data. Keep the URL private. You can also download or restore a backup file from Settings.

## Files
| File | What it is |
| --- | --- |
| `index.html` | The page |
| `style.css` | The look |
| `app.js` | Everything the app does |
| `google-apps-script.gs` | The Google Sheet sync script |
