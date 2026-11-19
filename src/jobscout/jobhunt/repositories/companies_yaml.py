"""companies.yaml and its files: add / remove companies (keeping comments),
strikes in data/matcher_state.json, and the ats_matcher/*.csv logs."""
from __future__ import annotations

import csv
import json
import os
import re
from datetime import datetime
from pathlib import Path

import yaml


_LIST_ITEM = re.compile(r"^(\s*-\s+)(.*?)\s*$")

NOT_FOUND_FILE = "failed_not_found.csv"
MAX_RETRIES_FILE = "failed_max_retries.csv"
PASSED_FILE = "passed.csv"
STATE_FILE = "data/matcher_state.json"
LOG_FIELDS = ["date", "company", "ats", "slug", "source", "reason", "jobs", "matching"]


# ------------------------------------------------------- strikes + logs ---

def today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def load_streaks(path: Path) -> dict[str, int]:
    """Strikes per 'ats:slug': runs in a row with 0 jobs matching the filters.
    Shared by `run` and `check`, so either one can strike or clear a company."""
    try:
        return dict(json.loads(path.read_text(encoding="utf-8")).get("zero_streak") or {})
    except (OSError, ValueError, AttributeError):
        return {}


def save_streaks(path: Path, streaks: dict[str, int]) -> None:
    path.write_text(json.dumps({"zero_streak": streaks}, indent=2, sort_keys=True), encoding="utf-8")


def log_rows(rows: list[dict], filename: str, fields: list[str] = LOG_FIELDS) -> Path | None:
    """Append rows to output/jobscout/ats_matcher/<filename>. Never raises."""
    if not rows:
        return None
    path = Path(os.environ.get("JOBSCOUT_OUTPUT_DIR") or "out") / "ats_matcher" / filename
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        new_file = not path.exists()
        with path.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            if new_file:
                w.writeheader()
            w.writerows(rows)
        return path
    except OSError as e:  # usually the CSV is open in Excel
        print(f"  ! could not write {path} ({e}) — close it in Excel and re-run")
        return None


# -------------------------------------------------------- yaml editing ---

def company_lines(lines: list[str]):
    """(line index, regex match, (ats, slug)) for each list item under `companies:`."""
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
        try:
            value = yaml.safe_load(m.group(2).split(" #", 1)[0])
        except yaml.YAMLError:
            continue
        if isinstance(value, dict) and value.get("ats") and value.get("slug"):
            yield i, m, (str(value["ats"]), str(value["slug"]))


def _flow(ats: str, slug: str, name: str) -> str:
    safe = re.fullmatch(r"[A-Za-z0-9][\w .&'-]*", name) is not None
    shown = name if safe else '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return f"{{ ats: {ats}, slug: {slug}, name: {shown} }}"


def add_to_companies_yaml(path: Path, entries: list[dict]) -> int:
    """Append {ats, slug, name} entries to the end of the list; skips duplicates."""
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    items = list(company_lines(lines))
    have = {key for _, _, key in items}
    new = []
    for e in entries:
        if (e["ats"], e["slug"]) not in have:
            have.add((e["ats"], e["slug"]))
            new.append(e)
    if not new:
        return 0
    eol = "\r\n" if lines and lines[0].endswith("\r\n") else "\n"
    prefix = items[-1][1].group(1) if items else "  - "
    at = items[-1][0] + 1 if items else len(lines)
    if at == len(lines) and lines and not lines[-1].endswith("\n"):
        lines[-1] += eol
    lines[at:at] = [f"{prefix}{_flow(e['ats'], e['slug'], e['name'])}{eol}" for e in new]
    path.write_text("".join(lines), encoding="utf-8")
    return len(new)


def remove_from_companies_yaml(path: Path, keys: set[tuple[str, str]]) -> int:
    """Delete matching lines only, so comments and layout survive."""
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    drop = {i for i, _, key in company_lines(lines) if key in keys}
    if drop:
        path.write_text("".join(l for i, l in enumerate(lines) if i not in drop), encoding="utf-8")
    return len(drop)
