# jobhunt: how the code is organised

Each folder holds one kind of code. A command starts in `cli.py`, goes to its
**controller**, and the controller calls the other folders.

```
cli.py           reads the command (run, scan, scrape, check, ...) and calls its controller
config/          settings.py: config.yaml, .env, data/profile.json, output folders
controllers/     one file per command; read these first, each is its flow top to bottom
  pipeline.py      start:jobscout (run) and start:jobscout-s (scan)
  scraper.py       start:scraper and start:jobscout-delete-all
  companies.py     start:jobscout-check
  profile.py       start:jobscout-profile
  tracker.py       applied / stats
models/          the data shapes, no logic
  job.py           Job: one job posting
  scraped_row.py   a scraper CSV row and how a JobSpy row becomes one
services/        the actual work
  boards.py        Greenhouse / Lever / Ashby / ... APIs
  matcher.py       which companies to check this run
  company_finder.py  find a company's board (start:jobscout-check)
  filters.py       title / location / experience / age filters
  experience.py    "how many years does this job ask for?"
  mailer.py        send the email
  ai/              llm.py (prompts) and providers.py (Anthropic, Gemini, Groq, ...)
  scraper/         sources.py (JobSpy), dedup.py (one row per job), unpaid.py
repositories/    reading and writing files, nothing else
  seen_store.py    data/seen.json (jobs already scored + applied)
  scraper_csv.py   output/scraper/<site>_jobs.csv
  companies_yaml.py  companies.yaml, strikes, ats_matcher logs
  tracker_csv.py   output/jobscout/jobs.csv
views/           what you see
  digest.py        the email (HTML)
  scraper_console.py  what start:scraper prints
dev/             mock.py: fake job boards for `--mock` runs and tests
```

The rule of thumb: **controllers** decide the order, **services** do the work,
**repositories** touch files, **models** are just data, **views** show results.
Tests in `tests/` use the same folders.
