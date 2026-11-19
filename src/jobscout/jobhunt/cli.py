"""jobhunt command line: reads the command, then hands it to its controller.

  profile     controllers/profile.py     resume -> data/profile.json
  run         controllers/pipeline.py    boards -> filter -> AI -> email
  scan, s     controllers/pipeline.py    saved scraper jobs -> AI -> email
  scrape      controllers/scraper.py     LinkedIn/Indeed/... -> output/scraper/*.csv
  delete-all  controllers/scraper.py     delete the scraper CSVs
  check       controllers/companies.py   find / test company boards
  boards      controllers/boards_scan.py scan every company board API for your profile (no AI)
  applied     controllers/tracker.py     mark a job as applied
  stats       controllers/tracker.py     tracker summary
"""
from __future__ import annotations

import argparse
import sys

from .config.settings import load_env
from .controllers.boards_scan import cmd_boards
from .controllers.companies import cmd_check
from .controllers.pipeline import cmd_run, cmd_scan
from .controllers.profile import cmd_profile
from .controllers.scraper import cmd_delete_all, cmd_scrape
from .controllers.tracker import cmd_applied, cmd_stats


def _utf8_output() -> None:
    """Windows prints through cp1252 when output is piped, which crashes on ✓ / ₹ / —.
    Always write UTF-8 (anything unprintable becomes '?' instead of a crash)."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass  # not a normal text stream (e.g. pytest capture)


def main(argv=None) -> int:
    _utf8_output()
    load_env()
    p = argparse.ArgumentParser(
        prog="jobhunt",
        description="Personal job-search agent. Finds and drafts; never submits.")
    p.add_argument("--config", default="config.yaml")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("profile", help="turn a resume into profile.json")
    sp.add_argument("--resume", default="data/resume.pdf", help="path to a .pdf, .txt or .md resume")
    sp.add_argument("--out", help="default: profile_file in config.yaml")
    sp.set_defaults(func=cmd_profile)

    sr = sub.add_parser("run", help="run the daily pipeline")
    sr.add_argument("--mock", action="store_true", help="bundled fixtures, no network")
    sr.add_argument("--scorer", choices=["llm", "keyword", "claude"], default="llm",
                    help="keyword = offline stub, needs no API key ('claude' is an "
                         "alias for 'llm', kept for older docs)")
    sr.add_argument("--no-draft", action="store_true", help="skip the expensive stage")
    sr.add_argument("--send", action="store_true", help="actually email the digest")
    sr.add_argument("--limit", type=int, help="cap jobs sent to the LLM (cost guard)")
    sr.set_defaults(func=cmd_run)

    sa = sub.add_parser("applied", help="mark a job_id as applied")
    sa.add_argument("job_id")
    sa.set_defaults(func=cmd_applied)

    ss = sub.add_parser("stats", help="tracker summary + CSV export")
    ss.set_defaults(func=cmd_stats)

    sc = sub.add_parser("check", help="find slugs for name-only companies, test every board")
    sc.set_defaults(func=cmd_check)

    sb = sub.add_parser("boards", help="call every company board API (companies.yaml + ats_matcher), "
                                        "filter for your profile, no AI, read-only")
    sb.set_defaults(func=cmd_boards)

    sj = sub.add_parser("scrape", help="search LinkedIn/Indeed/Glassdoor/Naukri with JobSpy, "
                                       "save to output/scraper/<site>_jobs.csv")
    sj.add_argument("--site", action="append", help="only this site (repeatable); "
                                                    "default: scraper.sites in config.yaml")
    sj.add_argument("--term", action="append", help="only this search term (repeatable)")
    sj.add_argument("--results", type=int, help="results per site per term")
    sj.add_argument("--no-filter", action="store_true", help="save everything, skip the title/"
                                                              "location/experience filters")
    sj.set_defaults(func=cmd_scrape)

    ss2 = sub.add_parser("scan", aliases=["s"], help="scan saved scraper jobs only, "
                                                     "no ATS fetch, no seen.json, batch size 5")
    ss2.add_argument("--mock", action="store_true", help="bundled fixtures, no network")
    ss2.add_argument("--send", action="store_true", help="actually email the digest")
    ss2.add_argument("--limit", type=int, help="cap jobs sent to the LLM (cost guard)")
    ss2.set_defaults(func=cmd_scan)

    sd = sub.add_parser("delete-all", aliases=["del-all"], help="delete all saved scraper CSVs "
                                                                "(LinkedIn, Indeed, Glassdoor, Naukri, ...)")
    sd.set_defaults(func=cmd_delete_all)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
