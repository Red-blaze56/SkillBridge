"""`pnpm start:jobscout-check`: find slugs for name-only companies, test every board."""
from __future__ import annotations

from pathlib import Path

from ..config.settings import load_config
from ..repositories.companies_yaml import STATE_FILE
from ..services.company_finder import check as check_companies


def cmd_check(args) -> int:
    cfg = load_config(args.config)
    return check_companies(Path(cfg.get("companies_file", "companies.yaml")),
                           cfg.get("filters", {}) or {},
                           Path(cfg.get("matcher_state_file") or STATE_FILE),
                           max(1, int(cfg.get("zero_match_limit") or 3)))
