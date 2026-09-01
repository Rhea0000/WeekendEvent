# Randstad Weekend Agenda

A weekend-events board for Amsterdam, Rotterdam, The Hague, Utrecht and nearby
towns. A GitHub Action runs a small script every Friday that searches the web
via Google's free-tier Gemini API and writes the results to
`data/events.json`. The website itself is a static page that just reads that
file — your API key never touches the browser.

## How it fits together
- `scripts/fetch-events.js` — calls the Gemini API (server-side, with Google Search grounding) and writes `data/events.json`
- `.github/workflows/update-events.yml` — runs that script every Friday, and any time you trigger it manually
- `index.html` — the static site; fetches `data/events.json` and renders it
- `data/events.json` — the current board (starts empty; the Action fills it in)

## Setup (15 minutes, one time)

1. **Create a GitHub repo.** On github.com, click New repository, make it
   **public** (needed for free GitHub Pages), name it something like
   `randstad-weekend-agenda`.

2. **Upload these files** to the repo, keeping the folder structure:
   - `index.html`
   - `package.json`
   - `scripts/fetch-events.js`
   - `.github/workflows/update-events.yml`
   - `data/events.json`

   Easiest way: on the repo page, "Add file" → "Upload files", drag in
   everything (GitHub will preserve the folder paths if you drag whole
   folders, or create the folders first and upload into them).

3. **Get a free Gemini API key.**
   - Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Sign in with a Google account, click "Create API key"
   - No credit card required. The free tier covers Flash models plus a
     monthly allowance of Google Search grounding — this script's usage
     (a handful of requests once a week) should comfortably stay within it
     at $0/month. If Google ever changes free-tier limits, worst case you'd
     see a quota error in the Action log rather than a surprise bill —
     nothing is billed unless you explicitly attach billing to the project.

4. **Add the key as a repo secret** (this keeps it private and off the
   public site):
   - In your repo: Settings → Secrets and variables → Actions → New repository secret
   - Name: `GEMINI_API_KEY`
   - Value: paste your key
   - Save

5. **Turn on GitHub Pages:**
   - Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: `main`, folder: `/ (root)`
   - Save. GitHub will give you a URL like
     `https://<your-username>.github.io/randstad-weekend-agenda/`

6. **Run the workflow once manually** to generate the first board:
   - Go to the Actions tab → "Update weekend events" → Run workflow
   - Wait about a minute, then check that `data/events.json` in the repo
     now has real events in it.

7. **Visit your site URL.** It should show this weekend's events. From now
   on, it updates itself automatically every Friday — no need to touch
   anything.

## Changing the schedule

Open `.github/workflows/update-events.yml` and edit the cron line:

```yaml
- cron: '0 8 * * 5'   # minute hour day month day-of-week (5 = Friday), all in UTC
```

For example `'0 7 * * 6'` would run Saturday 07:00 UTC instead.

## Triggering an update manually anytime

Actions tab → "Update weekend events" → Run workflow. Useful if you want
fresher data mid-week.

## Costs

- GitHub Actions: free for public repos.
- GitHub Pages: free for public repos.
- Gemini API: free tier, no credit card needed. At this project's volume
  (3 requests/week) you should never leave the free allowance. If you ever
  want a different model or provider, only `scripts/fetch-events.js` needs
  to change — the frontend and workflow don't care where the JSON came from.

