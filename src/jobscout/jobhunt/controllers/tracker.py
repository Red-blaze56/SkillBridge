"""`applied` and `stats`: the application tracker in data/seen.json."""
from __future__ import annotations

import json

from ..config.settings import load_config, output_path
from ..repositories.seen_store import Store


def cmd_applied(args) -> int:
    store = Store(load_config(args.config).get("seen_file", "data/seen.json"))
    ok = store.mark_applied(args.job_id)
    print("marked applied" if ok else f"unknown job_id: {args.job_id}")
    return 0 if ok else 1


def cmd_stats(args) -> int:
    cfg = load_config(args.config)
    store = Store(cfg.get("seen_file", "data/seen.json"))
    print(json.dumps(store.stats(), indent=2))
    print(f"csv: {store.export_csv(output_path(cfg.get('tracker_csv', 'tracker.csv')))}")
    return 0
