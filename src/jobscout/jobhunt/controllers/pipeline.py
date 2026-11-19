"""`pnpm start:jobscout` (run) and `start:jobscout-s` (scan).

run:  fetch boards -> filter -> skip seen jobs -> AI score -> AI summary -> email
scan: saved scraper jobs only -> filter -> AI score -> email
The agent never submits an application. It finds, filters, ranks and drafts.
"""
from __future__ import annotations

from pathlib import Path

from ..config.settings import load_config, load_profile, output_path, scraper_dir
from ..dev.mock import fetch_all_mock
from ..repositories import scraper_csv
from ..repositories.seen_store import Store
from ..repositories.tracker_csv import export_jobs
from ..services import mailer
from ..services.ai import llm
from ..services.ai.providers import LLMError, resolve
from ..services.boards import hydrate
from ..services.filters import prefilter_stats, too_experienced
from ..services.matcher import log_passed, run_batch
from ..views import digest as digest_mod


# ---------------------------------------------------------------------- run --
def cmd_run(args) -> int:
    cfg = load_config(args.config)
    profile = load_profile(cfg, allow_sample=args.mock)
    if profile is None:
        return 1
    store = Store(cfg.get("seen_file", "data/seen.json"))
    filters = cfg.get("filters", {}) or {}
    threshold = float(cfg.get("score_threshold", 7.0))
    # Every number the digest shows. Filled as the run goes, so any exit path
    # can still send the 0-match template.
    funnel: dict = {"scanned": 0, "dropped": {}, "passed_filters": 0, "already_seen": 0,
                    "new": 0, "scored": None, "unscored": 0, "matches": 0,
                    "threshold": threshold, "warning": None}

    # ---- 1. fetch
    print("\n[1/5] fetching boards")
    if args.mock:
        jobs = fetch_all_mock()
    else:
        companies = load_config(cfg.get("companies_file", "companies.yaml")).get("companies") or []
        unresolved = [c for c in companies if not (isinstance(c, dict) and c.get("ats") and c.get("slug"))]
        if unresolved:
            names = ", ".join(str(c.get("name") if isinstance(c, dict) else c) for c in unresolved)
            print(f"  ! skipping companies without a slug: {names}\n"
                  f"    run `pnpm start:jobscout-check` to look them up")
            companies = [c for c in companies if c not in unresolved]
        jobs, batch_info = run_batch(Path(cfg.get("companies_file", "companies.yaml")),
                                     companies, cfg, filters)
        funnel.update(batch_info)
    jobs += scraper_csv.load_saved(scraper_dir())
    scanned = len(jobs)
    funnel["scanned"] = scanned
    if not scanned:  # case A
        print("no postings fetched — check the slugs in companies.yaml")
        funnel["warning"] = ("0 jobs fetched — every board failed or returned nothing. "
                             "Check your internet connection and the slugs in companies.yaml.")
        return _finish_empty(args, cfg, store, funnel, [])

    # ---- 2. prefilter + dedupe (deterministic, free, no LLM)
    print("\n[2/5] filtering")
    jobs, dropped = prefilter_stats(jobs, filters)
    funnel["dropped"] = dropped
    new_jobs = store.unseen(jobs)
    funnel["already_seen"] = len(jobs) - len(new_jobs)
    jobs = new_jobs
    print(f"  new since last run: {len(jobs)}")
    if jobs:
        # SmartRecruiters/Breezy lists omit the description, so their
        # experience check can only run once it is loaded.
        hydrate(jobs)
        max_years = filters.get("max_experience_years")
        if max_years is not None:
            late = [j for j in jobs if too_experienced(j, int(max_years))]
            if late:
                print(f"  experience check after loading descriptions: dropped {len(late)}")
                dropped["experience"] = dropped.get("experience", 0) + len(late)
                jobs = [j for j in jobs if j not in late]
    funnel["passed_filters"] = funnel["already_seen"] + len(jobs)
    funnel["new"] = len(jobs)
    if args.limit:
        jobs = jobs[:args.limit]
        print(f"  --limit {args.limit} applied")

    if not jobs:  # cases B and C: nothing reached the AI
        print("\nnothing new today.")
        return _finish_empty(args, cfg, store, funnel, [])

    # ---- 3. screen
    scorer = "keyword" if args.scorer == "keyword" else "llm"
    if scorer == "keyword":
        print(f"\n[3/5] screening {len(jobs)} jobs (keyword stub — DEV ONLY)")
        llm.keyword_screen(jobs, profile)
        funnel["provider"] = "keyword stub"
    else:
        try:
            provider, model = resolve("screen")
        except LLMError as e:
            print(f"\n{e}\nNo key? Run with --scorer keyword for an offline dry run.")
            return 1
        print(f"\n[3/5] screening {len(jobs)} jobs via {provider.name}/{model}")
        funnel["provider"] = provider.name
        llm.screen(jobs, profile,
                   batch_size=int(cfg.get("screen_batch_size", 8)),
                   jd_chars=int(cfg.get("screen_jd_chars", 1400)),
                   provider=provider, model=model)

    scored = [j for j in jobs if j.score is not None]
    funnel["scored"] = len(scored)
    funnel["unscored"] = len(jobs) - len(scored)

    # Case D: every batch failed. Unscored jobs are never recorded as seen,
    # so the next run retries them.
    if not scored:
        print("\n! screening scored nothing: every batch failed.\n"
              "  Not recording these jobs, so the next run retries them.\n"
              "  Check the warnings above (bad key, rate limit, wrong model id).")
        funnel["warning"] = (f"AI scoring failed for all {len(jobs)} new jobs (Groq and the "
                             f"fallback). They were not marked as seen and will retry next run.")
        return _finish_empty(args, cfg, store, funnel, [])
    if funnel["unscored"]:  # case G
        funnel["warning"] = (f"{funnel['unscored']} job(s) couldn't be scored this run "
                             f"and will retry next run.")

    # Every board job over the bar is shown: all of them are about to be marked
    # seen, so one left out here would never come back. Only the best few get
    # the AI summary (one call each); the rest show the screen reason + JD start.
    # Scraper jobs score generously, so only their best few above a higher bar
    # make the email; every one keeps its score in output/scraper/*_jobs.csv.
    top_n = int(cfg.get("max_per_digest", 5))
    sc = cfg.get("scraper") or {}
    best = sorted([j for j in scored if j.score >= threshold],
                  key=lambda j: j.score, reverse=True)
    matches = [j for j in best if j.ats not in scraper_csv.SITES]
    scraped = [j for j in best if j.ats in scraper_csv.SITES
               and j.score >= float(sc.get("mail_min_score", 7.7))][:int(sc.get("mail_max", 4))]
    top = matches[:top_n]
    funnel["matches"] = len(matches) + len(scraped)
    print(f"  {len(matches)} board job(s) scored >= {threshold}, "
          f"{len(scraped)} scraper job(s) in the email")

    if not matches and not scraped:  # case E: scored, nothing cleared the bar — no draft call
        near = sorted(scored, key=lambda j: j.score, reverse=True)[:5]
        return _finish_empty(args, cfg, store, funnel, near, scored)

    # ---- 4. summarise (case F only: the one place the draft model is called)
    print(f"\n[4/5] summarising the top {len(top)} of {len(matches)}")
    if not top:
        print("  no board job to summarise")
    elif scorer == "keyword" or args.no_draft:
        print("  skipped (keyword scorer / --no-draft)")
    else:
        try:
            provider, model = resolve("draft")
            print(f"  via {provider.name}/{model}")
            llm.draft(top, profile,
                      jd_chars=int(cfg.get("draft_jd_chars", 6000)),
                      provider=provider, model=model)
        except LLMError as e:
            print(f"  ! summaries unavailable: {e}")

    # ---- 5. digest
    print("\n[5/5] digest")
    subject, doc = digest_mod.build(matches, funnel, store.stats(), top_n=top_n,
                                    scraped=scraped)
    path = digest_mod.write(doc, output_path(cfg.get("digest_file", "digest.html")))
    print(f"  wrote {path}")
    # Saved before emailing so a mail failure never loses the results.
    export_jobs(matches + scraped)

    sent = _send(args, subject, doc)
    if sent and not args.mock:
        log_passed(matches)
    return _wrap_up(cfg, store, funnel, scored, sent, subject, 0)


# ---------------------------------------------------------------- scan (-s) --
def cmd_scan(args) -> int:
    """Scan saved scraper jobs only (LinkedIn/Indeed/Glassdoor/Naukri CSVs).

    No ATS board fetch. No seen.json dedupe — every unscored saved job is
    considered. AI screening uses batch size 5. Scores are written back to the
    scraper CSVs so they are not re-scored next run. seen.json is untouched.
    """
    cfg = load_config(args.config)
    profile = load_profile(cfg, allow_sample=args.mock)
    if profile is None:
        return 1
    filters = cfg.get("filters", {}) or {}
    threshold = float(cfg.get("score_threshold", 7.0))
    funnel: dict = {"scanned": 0, "dropped": {}, "passed_filters": 0, "already_seen": 0,
                    "new": 0, "scored": None, "unscored": 0, "matches": 0,
                    "threshold": threshold, "warning": None}

    # ---- 1. load saved scraper jobs only
    print("\n[1/5] loading saved scraper jobs")
    jobs = scraper_csv.load_saved(scraper_dir())
    scanned = len(jobs)
    funnel["scanned"] = scanned
    if not scanned:
        print(f"no saved scraper jobs found — run `pnpm start:scraper` first")
        return _finish_empty_scan(args, cfg, funnel, [])
    print(f"  {scanned} saved scraper job(s) from {scraper_dir()}")

    # ---- 2. prefilter (no seen.json dedupe in scan mode)
    print("\n[2/5] filtering")
    jobs, dropped = prefilter_stats(jobs, filters)
    funnel["dropped"] = dropped
    funnel["passed_filters"] = len(jobs)
    funnel["new"] = len(jobs)
    print(f"  {len(jobs)} job(s) passed filters")

    per_site = int((cfg.get("scraper") or {}).get("score_per_site") or 0)
    if per_site:
        jobs, waiting = scraper_csv.sample_per_site(jobs, per_site)
        if waiting:
            funnel["waiting"] = waiting
            print(f"  {per_site} random per site this run, {waiting} wait for next runs")

    if args.limit:
        jobs = jobs[:args.limit]
        print(f"  --limit {args.limit} applied")

    if not jobs:
        print("\nnothing new today.")
        return _finish_empty_scan(args, cfg, funnel, [])

    # ---- 3. screen with batch size 5
    print(f"\n[3/5] screening {len(jobs)} jobs via LLM (batch size 5)")
    try:
        provider, model = resolve("screen")
    except LLMError as e:
        print(f"\n{e}\nNo key? Run with --scorer keyword for an offline dry run.")
        return 1
    funnel["provider"] = provider.name
    llm.screen(jobs, profile,
               batch_size=5,
               jd_chars=int(cfg.get("screen_jd_chars", 1400)),
               provider=provider, model=model)

    scored = [j for j in jobs if j.score is not None]
    funnel["scored"] = len(scored)
    funnel["unscored"] = len(jobs) - len(scored)

    if not scored:
        print("\n! screening scored nothing: every batch failed.")
        funnel["warning"] = f"AI scoring failed for all {len(jobs)} jobs."
        return _finish_empty_scan(args, cfg, funnel, [])
    if funnel["unscored"]:
        funnel["warning"] = (f"{funnel['unscored']} job(s) couldn't be scored this run "
                             f"and will retry next run.")

    # ---- 4. pick matches
    top_n = int(cfg.get("max_per_digest", 5))
    sc = cfg.get("scraper") or {}
    best = sorted([j for j in scored if j.score >= threshold],
                  key=lambda j: j.score, reverse=True)
    scraped = [j for j in best if j.score >= float(sc.get("mail_min_score", 7.7))][:int(sc.get("mail_max", 4))]
    top = scraped[:top_n]
    funnel["matches"] = len(scraped)
    print(f"  {len(scraped)} scraper job(s) scored >= {threshold}")

    if not scraped:
        near = sorted(scored, key=lambda j: j.score, reverse=True)[:5]
        return _finish_empty_scan(args, cfg, funnel, near)

    # ---- 5. digest — full cards for matched scraper jobs (like normal mode)
    print("\n[4/5] digest")
    subject, doc = digest_mod.build(scraped, funnel, {}, top_n=top_n, scraped=[])
    path = digest_mod.write(doc, output_path(cfg.get("digest_file", "digest.html")))
    print(f"  wrote {path}")
    export_jobs(scraped)

    sent = _send(args, subject, doc)

    # Write scores back to scraper CSVs so they are not re-scored next run.
    scraper_csv.write_scores(scraper_dir(), scored)

    print(f"\nfunnel: {funnel['scanned']} scanned -> {funnel['passed_filters']} passed filters "
          f"-> {funnel['new']} new -> {funnel['matches']} in digest")
    print(f"subject: {subject}")
    return 0


def _finish_empty_scan(args, cfg: dict, funnel: dict, near_misses: list) -> int:
    """Scan-mode empty digest — no seen.json, no AI call."""
    print("\n[5/5] digest (0-match template, no AI call)")
    subject, doc = digest_mod.build([], funnel, {}, near_misses)
    path = digest_mod.write(doc, output_path(cfg.get("digest_file", "digest.html")))
    print(f"  wrote {path}")
    sent = _send(args, subject, doc)
    return 0 if not funnel.get("warning") else 1


def _send(args, subject: str, doc: str) -> bool:
    if not args.send:
        print("  --send not passed, email skipped")
        return False
    try:
        mailer.send(subject, doc)
        return True
    except Exception as e:  # bad app password, blocked port, offline
        print(f"  ! email failed ({type(e).__name__}: {e}) — digest still on disk")
        return False


def _wrap_up(cfg: dict, store: Store, funnel: dict, scored: list, sent: bool,
             subject: str, code: int) -> int:
    # Only jobs that got a score are marked seen; an unscored job (its batch
    # failed) stays new and is retried next run instead of being lost.
    scraper_csv.write_scores(scraper_dir(), scored)
    store.record(scored, emailed=sent)
    csv_path = store.export_csv(output_path(cfg.get("tracker_csv", "tracker.csv")))
    print(f"\nfunnel: {funnel['scanned']} scanned -> {funnel['passed_filters']} passed filters "
          f"-> {funnel['new']} new -> {funnel['matches']} in digest")
    print(f"subject: {subject}")
    print(f"tracker: {store.stats()}  ({csv_path})")
    return code


def _finish_empty(args, cfg: dict, store: Store, funnel: dict, near_misses: list,
                  scored: list | None = None) -> int:
    """Cases A-E: the fixed 0-match template. Built from run numbers only, so
    no LLM is called. Cases A and D (nothing fetched / AI failed) exit 1."""
    print("\n[5/5] digest (0-match template, no AI call)")
    subject, doc = digest_mod.build([], funnel, store.stats(), near_misses)
    path = digest_mod.write(doc, output_path(cfg.get("digest_file", "digest.html")))
    print(f"  wrote {path}")
    sent = _send(args, subject, doc)
    return _wrap_up(cfg, store, funnel, scored or [], sent, subject,
                    1 if funnel.get("warning") and not scored else 0)

