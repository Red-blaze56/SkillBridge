"""Settings shared by every command: config.yaml, .env, profile.json, output folders."""
from __future__ import annotations

import json
import os
from pathlib import Path

import yaml

from ..repositories.scraper_csv import DEFAULT_OUT

ROOT = Path(__file__).resolve().parents[2]          # src/jobscout


def load_env(path: str = ".env") -> None:
    """Minimal .env reader so there is no python-dotenv dependency."""
    candidates = [Path(path), ROOT / ".env", ROOT.parent / ".env"]
    for p in candidates:
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            break


def load_config(path: str | Path) -> dict:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"config not found: {p}  (run from the project root)")
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}


def output_path(name: str) -> Path:
    """Where a generated file goes: output/jobscout/ (set by run.ts), else out/."""
    return Path(os.environ.get("JOBSCOUT_OUTPUT_DIR") or "out") / name


def scraper_dir() -> Path:
    """Where start:scraper saves <site>_jobs.csv: output/scraper/ (set by run.ts)."""
    return Path(os.environ.get("SCRAPER_OUTPUT_DIR") or DEFAULT_OUT)


def load_profile(cfg: dict, allow_sample: bool) -> dict | None:
    path = Path(cfg.get("profile_file", "data/profile.json"))
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    sample = ROOT / "profile.example.json"
    if allow_sample and sample.exists():
        print(f"  ! {path} missing — using {sample.name} for this dry run.")
        print("    Build the real one: pnpm start:jobscout-profile")
        return json.loads(sample.read_text(encoding="utf-8"))

    print(f"missing {path} — put your resume at data/resume.pdf and run "
          f"`pnpm start:jobscout-profile` first")
    return None
