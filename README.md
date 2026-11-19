# job-auto-apply

Automates one-click job applications on **Wellfound** and **Instahyre** using Playwright. Runs locally in your own browser with your own session — no AI, no backend, completely free.

## What it does

- Scrolls through your filtered job results and applies to every job with a clean one-click apply flow
- Skips: already applied, external applications, mandatory questions, CAPTCHAs
- Fills Wellfound's optional "what interests you" field with one of 3 generic messages (picked at random, company name filled in)
- Uses short randomized waits instead of fixed delays
- Works across pages (handles pagination and lazy loading)
- **Instahyre only applies to jobs asking for 0, 1 or 2 years** of experience (the minimum of the range: 0-2, 1-3 and 2-4 are applied to; 3-5 and 5+ are skipped). Skipped-for-experience jobs aren't failures, so they're only counted in the terminal, not written to failed.csv.
- Results are saved per site in `output/autoapply/wellfound/`, `output/autoapply/instahyre/`, `output/autoapply/indeed/`, `output/autoapply/glassdoor/` and `output/autoapply/naukri/`:
  - `passed.csv` — applied jobs with company, role, role category (Full Stack / Backend / Frontend / React / SDE / Other), experience and link
  - `failed.csv` — jobs that couldn't be submitted, with the reason, plus a reason totals table at the bottom. When a form question couldn't be filled, the reason names it: `Field not filled: "Notice period"; "Expected CTC"` (also added to `output/missing_questions.json`)
- Prints Applied / Failed / Reason tables in the terminal at the end of each run, and refreshes `output/dashboard.html`

## First time: run everything once

```
1. pnpm install                          ← Node packages (once)
2. copy .env.example .env, fill it in    ← Gemini key + Gmail app password (for JobScout)
3. Wellfound:  pnpm start:wellfound      → log in in the browser → open your filtered jobs → press ENTER
4. Instahyre:  put your search URL in src/bots/instahyre/selectors.ts (INSTAHYRE_JOBS_URL)
               pnpm start:instahyre      → log in → press ENTER when jobs show
5. JobScout:   pnpm start:jobscout-setup     (Python environment, once)
               put resume.pdf in src/jobscout/data/ → pnpm start:jobscout-profile
               edit src/jobscout/companies.yaml → pnpm start:jobscout-check
               pnpm start:jobscout           (every morning)
6. Naukri:     pnpm start:naukri --max 3  → log in once → press ENTER (settings: src/bots/naukri/settings.ts)
7. Open output/dashboard.html to see everything in one place (`pnpm dashboard` rebuilds it).
```
Browser logins are remembered, so from the second run on you skip the login step.

## Requirements

- Node.js ≥ 18
- pnpm
- Brave, Chrome, or Chromium (optional — auto-detected if installed)

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

## Usage

**Wellfound:**
```bash
pnpm start:wellfound
```
1. Browser opens — log in to Wellfound if needed
2. Set your filters and navigate to your job results
3. Press **ENTER** in the terminal
4. Watch it go

**Instahyre:**
```bash
pnpm start:instahyre
```
1. Browser opens and loads your saved Instahyre filter URL — log in if needed
2. Update `INSTAHYRE_JOBS_URL` in `src/bots/instahyre/selectors.ts` with your own filter URL
3. Press **ENTER** when results are showing
4. Watch it go

**Naukri:**
```bash
pnpm start:naukri            # or: pnpm start:naukri --max 3   (stop after 3 applications)
pnpm start:naukri-search     # types each keyword into Naukri's search bar, takes 10–15 jobs per keyword
```
**Search mode (every bot):** `pnpm start:naukri-search`, `start:indeed-search`, `start:glassdoor-search`, `start:instahyre-search`, `start:wellfound-search`. Log in, press ENTER, and the bot types each keyword into the site's own search bar, takes 10–15 jobs per keyword (titles must pass the title rules), applies, then searches the next keyword. If a site's search bar can't be used, it asks you to type the keyword yourself and carries on. Add `--max 3` to stop after 3 applications.
Keywords, jobs per keyword and the title rules (include / exclude) are in `src/shared/search.ts`, shared by all bots. Naukri's date filter is `searchJobAgeDays` in `src/bots/naukri/settings.ts`.
1. Browser opens on Naukri — log in the first time (the login is saved)
2. It searches every term in `src/bots/naukri/settings.ts` (fresher filter, last 3 days) and shows how many jobs it will open
3. Press **ENTER** to start. It applies only to Naukri one-click jobs that pass the same title rules as the scraper and ask for 0–2 years; "Apply on company site", walk-ins and senior roles are skipped
4. Naukri's question popup ("notice period?"): saved answers are filled in; a new question waits 90 s for you to answer it in the browser, and your answer is saved to `data/naukri_answers.json` for next time
5. If Naukri shows a captcha, solve it in the browser — the bot waits. It stops by itself when Naukri's daily limit is reached

**Glassdoor:**
```bash
pnpm start:glassdoor
```
1. Browser opens on glassdoor.co.in — log in to Glassdoor (and Indeed: Easy Apply uses your Indeed account)
2. Search and turn on the **Easy Apply only** filter, then press **ENTER**
3. It loads up to 40 jobs ("Show more jobs"; change with `GLASSDOOR_MIN_JOBS`) and press **ENTER** again
4. Each Easy Apply opens Indeed's Smart Apply form in a new tab — same flow as Indeed: robot check, Continue steps, Submit. "Apply on employer site" and 3+ yrs jobs are skipped

**Google Forms filler** (fills, never submits):
```bash
pnpm start:forms "https://docs.google.com/forms/d/.../viewform"   # or run without a link and paste it
```
1. Sign in to Google in the browser the first time (needed for email and file-upload questions)
2. It fills what it knows from `data/form_profile.json` (name, email, phone, GitHub, LinkedIn, admission/roll no, address, city/state, CGPA or percentage, 10th/12th, skills from your resume profile) and uploads `resume.pdf` for resume questions
3. A question it doesn't know is asked in the terminal — type the answer (or the option number) and it's saved to `data/form_answers.json` for next time; press ENTER to leave it and fill it yourself in the browser
4. Multi-page forms: after each page you check it in the browser, then press ENTER to go to the next page
5. At the end it lists what it filled and what's left for you — **you review and click Submit yourself**

Change any detail in `data/form_profile.json` (an empty value = ask me). Both `data/` files are gitignored.

### Running several bots at once

All bots share **one browser window, one tab per bot**. Start them in separate terminals (e.g. `pnpm start:indeed`, `pnpm start:glassdoor`, `pnpm start:naukri`, …): the first one opens the browser, the rest join it with a new tab. The browser closes when the last bot finishes.

The bots talk to the browser over a local DevTools port (`127.0.0.1:9222`, change with `BROWSER_DEBUG_PORT`). While it is open, any program on this computer can control that browser — so close it when you're done.

If you see *"Browser did not open its debug port"*, a browser window from an older run is still using the bot profile — close it and run again.

Your browser session is stored in `~/.wellfound-automation/browser-profile/` and reused on every run — no need to log in again after the first time.

## JobScout (daily job digest)

`src/jobscout/` pulls jobs from company boards on Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Recruitee, scores them against your resume (Groq, free tier), writes a short JD summary for the best ones (Gemini), and emails you every job scoring 7+. It never applies for you. Requires Python 3.10+.

**One-time setup**
1. Fill in the JobScout keys in the root `.env` (see `.env.example`).
2. `pnpm start:jobscout-setup` — creates the Python environment.
3. Put your resume at `src/jobscout/data/resume.pdf`, then `pnpm start:jobscout-profile`. Check the generated `src/jobscout/data/profile.json`.
4. List your companies in `src/jobscout/companies.yaml` (just the name is enough — see below) and run `pnpm start:jobscout-check`.

**Every morning:** `pnpm start:jobscout`

| Command | Does |
|---|---|
| `pnpm start:jobscout` | finds jobs, emails the digest, saves `output/jobscout/jobs.csv`, refreshes the dashboard |
| `pnpm start:jobscout-setup` | creates the Python environment and installs packages (once) |
| `pnpm start:jobscout-profile` | reads `resume.pdf` → writes `profile.json` |
| `pnpm start:jobscout-check` | finds slugs for new companies, then tests every company link (free: no AI, no email) |
| `pnpm start:jobscout-reset` | backs up `seen.json` to `output/jobscout/`, then clears it so every job is looked at again |

**When you change a file, run:**

| You changed… | Run |
|---|---|
| `companies.yaml` | `start:jobscout-check` |
| `config.yaml` (titles, locations, threshold) | `start:jobscout-check`, then `start:jobscout-reset` |
| `resume.pdf` | `start:jobscout-profile`, then `start:jobscout-reset` |
| `profile.json` (hand edits) | `start:jobscout-reset` |
| `.env` | nothing |

Reset matters because `seen.json` remembers every job already scored — without it, jobs rejected under your old settings are never looked at again.

**Where the files live**
```
src/jobscout/
  config.yaml, companies.yaml   your settings (edit these)
  data/                          resume.pdf, profile.json, seen.json, matcher_state.json (private, gitignored)
  ats_matcher/                   candidate company lists the daily run samples from
  jobhunt/, tests/, run.ts       code (folder guide: src/jobscout/jobhunt/README.md)
output/jobscout/                 jobs.csv, digest.html, tracker.csv, ats_matcher/ logs
```

**Changing companies — the best way**
1. Open `src/jobscout/companies.yaml`.
2. **Add:** a new line with just the name, e.g. `- Razorpay`. **Remove:** delete the line, or put `#` in front to pause it.
3. Run `pnpm start:jobscout-check` — it finds the board for new names, rewrites the lines, and shows which links work and how many jobs pass your filters:
   ```yaml
   - Razorpay            # becomes: - {ats: lever, slug: razorpay, name: Razorpay}
   ```
4. Done — the next `pnpm start:jobscout` includes them. **No reinstall, no setup, no reset** (new companies' jobs are new to `seen.json` anyway).

Names it can't find are commented out as `# NOT FOUND …` — those companies use a hiring system this tool can't read (Workday, their own site). `companies.yaml` already ends with a verified starter list of India-hiring companies; delete any you don't want.

**How it works (the ATS flow)**

Companies don't host their job lists themselves — they use a hiring system called an **ATS** (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee). Each company gets a free public job board on it, named by a **slug** — e.g. Stripe on Greenhouse is `stripe`, readable at `boards-api.greenhouse.io/v1/boards/stripe/jobs`. No login, no scraping.

```
companies.yaml ──► 1 FETCH      every company's board (ats + slug)            free
                   2 FILTER     title / location / age rules (config.yaml)    free
                   3 NEW ONLY   drop jobs already in seen.json                free
                   4 SCORE      Groq rates each job 0–10 vs profile.json       AI
                   5 SHORTLIST  every job with score ≥ score_threshold (7.0) is emailed
                   6 SUMMARY    Gemini summarises the JD + resume match, top max_per_digest (5) only   AI
                   7 OUTPUT     digest.html + output/jobscout/jobs.csv + email + dashboard
                   8 REMEMBER   every scored job goes into seen.json
```
JobScout never applies — you open the links from the email and apply yourself.

## Scraper (LinkedIn, Indeed, Glassdoor, Naukri)

`pnpm start:scraper` searches job sites with [JobSpy](https://github.com/speedyapply/JobSpy). It needs no API key and sends no email. It runs every search term on every site, applies the same title / location / experience / age filters as JobScout, and appends new jobs to one CSV per site:

```
output/scraper/linkedin_jobs.csv
output/scraper/indeed_jobs.csv
output/scraper/glassdoor_jobs.csv
output/scraper/naukri_jobs.csv
```

Each row has: Date, Company, Role, Role Category, Experience (yrs), **Work Mode** (Remote / Hybrid / On-site / Not mentioned), Location, Link, Apply Link (company's own page, when the site gives it), Job Type, Job Level, Salary, Posted, Skills, Industry, Job Function, Company Size, Company Rating, Company Reviews, Openings, Emails, Company Page, Search Term, Site, Description. Columns a site doesn't publish stay empty (e.g. only Naukri gives skills and openings).

**AI score:** the next `pnpm start:jobscout` scores every saved job it hasn't scored yet against your resume (once per job), emails the 7+ ones with the board jobs, and fills the `Score` and `AI Reason` columns in these CSVs. Turn it off with `include_in_run: false`.

A link already in a site's CSV is never written twice, so running it again only adds new jobs. Sites, search terms, location, `results_wanted` and `hours_old` are under `scraper:` in `src/jobscout/config.yaml`. One-off overrides:

```
pnpm start:scraper --site linkedin                     # one site
pnpm start:scraper --site naukri --term "react developer" --results 50
pnpm start:scraper --no-filter                         # save everything, skip the filters
```

`fetch_description: true` (the default) opens every job for its full description, seniority, industry and direct apply link. It is slower, and LinkedIn rate-limits fast (`LinkedIn response status code 429`): you then get fewer LinkedIn results until you wait an hour or so. Set it to `false` for a quick run; Experience then says `Not loaded` for LinkedIn and Glassdoor.

## Project layout

```
src/
  shared/              used by every bot
    browser.ts         open / attach Chrome
    logger.ts          coloured terminal + file log
    delay.ts           human-like random waits
    classify.ts        role + experience tags
  reports/             what you get after a run
    csv.ts             output/autoapply/*.csv
    run-summary.ts     end-of-run summary
    dashboard.ts       output/dashboard.html (pnpm dashboard)
  bots/                one folder per site, same file names in each
    wellfound/         index.ts (the flow), jobs.ts, application.ts, selectors.ts
    instahyre/         index.ts, jobs.ts, selectors.ts
    indeed/            index.ts, jobs.ts, application.ts, selectors.ts, delay.ts
    naukri/            index.ts, jobs.ts, application.ts, selectors.ts, settings.ts, answers.ts
  jobscout/            Python job finder + scraper (see JobScout above)
```

In each bot, `index.ts` is the whole run from top to bottom, `jobs.ts` finds and
opens jobs, `application.ts` fills and submits, and `selectors.ts` holds the
page selectors and URLs (the file to edit when a site changes its layout).

## Results and dashboard

```
output/
  autoapply/   wellfound/, instahyre/, indeed/, naukri/  → passed.csv, failed.csv, logs/ (applications)
  jobscout/    jobs.csv (every job emailed to you), digest.html, tracker.csv, ats_matcher/
  scraper/     linkedin_jobs.csv, indeed_jobs.csv, glassdoor_jobs.csv, naukri_jobs.csv, logs/
  dashboard.html
```
- `output/dashboard.html`: open it in your browser. It's rebuilt after every Wellfound, Instahyre, Indeed, Naukri, JobScout and scraper run (or `pnpm dashboard`).
  - **Apply next** (the start page): the best JobScout and scraper jobs in one list, best score first. Open a job, apply, press **✓ Applied** (or **✕** if not interested). Your marks are remembered in that browser; jobs a bot already applied to move to Applied by themselves.
  - **Overview**: totals, applications per day, applied per bot, and why bot applications failed.
  - **Found jobs** (scraper, all sites or one site), **JobScout** (emailed matches, every scored job, company checks) and **Bot results** (each bot's applied + failed jobs in one table — filter Status = Failed for jobs to apply to by hand).

**Logs.** The terminal shows only what matters: one header line per job with a running
tally (✓ applied ⊘ skipped ✗ failed), its key facts, its result, warnings (`!`) and the
summary. Every step (clicks, waits, retries) goes to a log file per run in
`output/autoapply/<bot>/logs/` and `output/scraper/logs/`; the newest 10 are kept. To see
the steps in the terminal too, add `LOG_LEVEL=debug` to `.env`.

## Browser

Auto-detects in order: **Brave → Chrome → Chromium**, then falls back to Playwright's Chromium. Works on macOS, Linux, and Windows.

To use a custom browser path, set `BROWSER_PATH` in your `.env`:
```
BROWSER_PATH=/path/to/browser
```

## Selectors

- Wellfound: `src/bots/wellfound/selectors.ts`
- Instahyre: `src/bots/instahyre/selectors.ts`
- Naukri: `src/bots/naukri/selectors.ts`

If a site updates its UI, that's the only file to touch.
