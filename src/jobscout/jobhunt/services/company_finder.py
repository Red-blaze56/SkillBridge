"""Find companies' ATS boards. `check`: find slugs for name-only companies, then
test every board link. Dead links are removed to failed_not_found.csv; a company
with 0 matching jobs gets a strike, and at the limit it is removed to
failed_max_retries.csv."""
from __future__ import annotations

import contextlib
import io
import re
from pathlib import Path

import requests
import yaml

from ..repositories.companies_yaml import (_LIST_ITEM, MAX_RETRIES_FILE, NOT_FOUND_FILE,
                                          STATE_FILE, _flow, load_streaks, log_rows,
                                          remove_from_companies_yaml, save_streaks, today)
from .boards import ENDPOINTS, get_board
from .filters import prefilter

ATS_ORDER = ("greenhouse", "lever", "ashby", "workable", "smartrecruiters", "recruitee",
             "breezy", "teamtailor")
_STOP = {"inc", "labs", "lab", "technologies", "technology", "tech", "ai", "hq", "co",
         "company", "corp", "corporation", "ltd", "limited", "pvt", "private", "software",
         "io", "com", "the"}


# --------------------------------------------------------------- probing ---

def slug_candidates(name: str) -> list[str]:
    base = re.sub(r"\.(com|io|ai|co|in|so|dev)\b", "", name.lower())
    words = re.findall(r"[a-z0-9]+", base)
    core = [w for w in words if w not in _STOP] or words
    raw = ["".join(words), "-".join(words), "".join(core), "-".join(core),
           "".join(core) + "hq", "".join(core) + "-inc"]
    return list(dict.fromkeys(s for s in raw if s))


def probe_detail(ats: str, slug: str, session: requests.Session,
                 company: str | None = None) -> tuple[str, str, list]:
    """(kind, status, jobs). kind is 'ok', 'not_found' (404/410), 'wrong_link'
    (answered, but not with job data) or 'temporary' (timeout, 429, 5xx...),
    so callers only delete a company when the board is really gone."""
    try:
        code, body = get_board(ats, slug, session)
    except ValueError as e:  # JSON decode error: the page exists but isn't a job board
        return "wrong_link", f"ERROR ({type(e).__name__})", []
    except Exception as e:  # network blip, timeout
        return "temporary", f"ERROR ({type(e).__name__})", []
    if code != 200:
        return ("not_found" if code in (404, 410) else "temporary"), f"DEAD ({code})", []
    try:
        return "ok", "OK", ENDPOINTS[ats][1](slug, company or slug, body)
    except Exception as e:
        return "wrong_link", f"ERROR ({type(e).__name__})", []


def probe(ats: str, slug: str, session: requests.Session) -> tuple[str, list]:
    """Returns (status, jobs). status is 'OK', 'DEAD (404)', 'ERROR (...)'."""
    _, status, jobs = probe_detail(ats, slug, session)
    return status, jobs


def find_slug(name: str, session: requests.Session) -> tuple[str, str, int] | None:
    """(ats, slug, job_count) for the first board with jobs, else the first empty
    board, else None. The APIs answer 404 for unknown slugs, so an empty 200 is
    a real board that just has no openings today. Two exceptions, where only a
    board with jobs counts: SmartRecruiters answers 200 with an empty list for
    any name, and Workable keeps empty accounts for companies that left it.
    """
    empty: tuple[str, str, int] | None = None
    for slug in slug_candidates(name):
        for ats in ATS_ORDER:
            status, jobs = probe(ats, slug, session)
            if status == "OK" and jobs:
                return ats, slug, len(jobs)
            if status == "OK" and empty is None and ats not in ("workable", "smartrecruiters"):
                empty = (ats, slug, 0)
    return empty


def _name_only(item_text: str) -> str | None:
    """Company name if this list item has no ats/slug yet, else None."""
    text = item_text.split(" #", 1)[0].strip()
    if not text or text.startswith("#"):
        return None
    try:
        value = yaml.safe_load(text)
    except yaml.YAMLError:
        return None
    if isinstance(value, (str, int, float)):
        return str(value).strip() or None
    if isinstance(value, dict) and value.get("name") and not (value.get("ats") and value.get("slug")):
        return str(value["name"]).strip()
    return None


def resolve_names(path: Path, session: requests.Session) -> dict[str, str]:
    """Rewrites name-only lines in place; removes names found on no board.
    Returns {name: 'FOUND' | 'NOT FOUND'}."""
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    results: dict[str, str] = {}
    in_companies = False
    for i, line in enumerate(lines):
        if re.match(r"^companies\s*:", line):
            in_companies = True
            continue
        if in_companies and re.match(r"^\S", line) and not line.startswith(("-", "#")):
            in_companies = False
        m = _LIST_ITEM.match(line.rstrip("\r\n"))
        if not in_companies or not m:
            continue
        name = _name_only(m.group(2))
        if not name:
            continue
        eol = "\r\n" if line.endswith("\r\n") else "\n"
        print(f"  looking up {name} ...")
        hit = find_slug(name, session)
        if hit:
            ats, slug, _ = hit
            lines[i] = f"{m.group(1)}{_flow(ats, slug, name)}{eol}"
            results[name] = "FOUND"
        else:
            lines[i] = ""
            results[name] = "NOT FOUND"
    if results:
        path.write_text("".join(lines), encoding="utf-8")
    return results


def check(companies_path: Path, filters: dict, state_path: Path = Path(STATE_FILE),
          limit: int = 3) -> int:
    session = requests.Session()
    streaks = load_streaks(state_path)

    print("\n[1/2] finding slugs for name-only entries")
    found = resolve_names(companies_path, session)
    if not found:
        print("  none — every company already has ats + slug")
    missing = [n for n, s in found.items() if s == "NOT FOUND"]

    print("\n[2/2] testing every company link")
    data = yaml.safe_load(companies_path.read_text(encoding="utf-8")) or {}
    rows, dead, maxed = [], [], []
    for c in data.get("companies") or []:
        if not (isinstance(c, dict) and c.get("ats") and c.get("slug")):
            continue
        name = c.get("name") or c["slug"]
        ats, slug = str(c["ats"]), str(c["slug"])
        key = f"{ats}:{slug}"
        if ats not in ENDPOINTS:
            rows.append((name, ats, "UNKNOWN ATS", "0", "-"))
            continue
        kind, status, jobs = probe_detail(ats, slug, session)
        if kind == "ok":
            with contextlib.redirect_stdout(io.StringIO()):
                passing = len(prefilter(jobs, filters))
            if found.get(name) == "FOUND":
                status = "FOUND + OK" if jobs else "FOUND, 0 jobs"
            elif not jobs:
                status = "OK, 0 jobs"
            if passing:
                streaks.pop(key, None)
            else:
                streaks[key] = streaks.get(key, 0) + 1
                if streaks[key] >= limit:
                    maxed.append((ats, slug, str(name), len(jobs)))
                    streaks.pop(key)
                    status = f"{status}, strike {limit}/{limit} REMOVED"
                else:
                    status = f"{status}, strike {streaks[key]}/{limit}"
            rows.append((name, ats, status, str(len(jobs)), str(passing)))
        else:
            if kind == "not_found":
                dead.append((ats, slug, str(name)))
                streaks.pop(key, None)
                status = f"{status}, REMOVED"
            rows.append((name, ats, status, "0", "-"))

    removed = remove_from_companies_yaml(
        companies_path, {(a, s) for a, s, _ in dead} | {(a, s) for a, s, _, _ in maxed})
    save_streaks(state_path, streaks)
    log_path = log_rows(
        [{"date": today(), "company": n, "ats": a, "slug": s, "source": companies_path.name,
          "reason": "not found", "jobs": 0, "matching": 0} for a, s, n in dead]
        + [{"date": today(), "company": n, "ats": "", "slug": "", "source": companies_path.name,
            "reason": "not found on any job board", "jobs": 0, "matching": 0} for n in missing],
        NOT_FOUND_FILE)
    maxed_path = log_rows(
        [{"date": today(), "company": n, "ats": a, "slug": s, "source": companies_path.name,
          "reason": f"0 matching jobs {limit} runs", "jobs": j, "matching": 0} for a, s, n, j in maxed],
        MAX_RETRIES_FILE)

    header = ("Company", "ATS", "Status", "Jobs", "Pass your filters")
    widths = [max(len(str(r[i])) for r in [header, *rows]) for i in range(len(header))]
    print()
    for r in [header, *rows]:
        print("  " + "  ".join(
            str(cell).rjust(w) if i >= 3 else str(cell).ljust(w) for i, (cell, w) in enumerate(zip(r, widths))))

    broken = [r for r in rows if not r[2].startswith(("OK", "FOUND")) and "REMOVED" not in r[2]]
    print()
    if dead:
        print(f"  -> {len(dead)} dead link(s) removed from {companies_path.name}")
    if missing:
        print(f"  -> not found on any job board, removed from {companies_path.name}: {', '.join(missing)}")
        print("     they probably use another hiring system (Workday, own site) this tool can't read")
    if log_path:
        print(f"     logged to {log_path}")
    if maxed:
        one = len(maxed) == 1
        print(f"  -> {len(maxed)} compan{'y' if one else 'ies'} hit {limit} strikes (0 matching jobs) "
              f"and {'was' if one else 'were'} removed: {', '.join(n for _, _, n, _ in maxed)}")
        print(f"     logged to {maxed_path}")
    struck = sum(1 for r in rows if "strike" in r[2] and "REMOVED" not in r[2])
    if struck:
        print(f"  -> {struck} compan{'y' if struck == 1 else 'ies'} got a strike for 0 matching jobs "
              f"(removed at {limit})")
    if broken:
        print(f"  -> {len(broken)} link(s) failed for a temporary reason (timeout, rate limit) — kept, re-run later")
    if not removed and not missing and not broken and not struck:
        print("  -> all company links work")
    total_pass = sum(int(r[4]) for r in rows if r[4].isdigit())
    print(f"  -> {total_pass} job(s) pass your config.yaml filters right now (before AI scoring)")
    return 0
