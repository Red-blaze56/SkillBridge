"""`pnpm start:jobscout-profile`: turn your resume into data/profile.json."""
from __future__ import annotations

import json
from pathlib import Path

from ..config.settings import load_config
from ..services.ai import llm
from ..services.ai.providers import LLMError, resolve


def cmd_profile(args) -> int:
    src = Path(args.resume)
    if not src.exists():
        print(f"resume not found: {src}")
        return 1
    out = Path(args.out or load_config(args.config).get("profile_file", "data/profile.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    is_pdf = src.suffix.lower() == ".pdf"

    try:
        provider, model = resolve("draft")
        print(f"reading {src.name} via {provider.name}/{model} ...")
        profile = llm.build_profile(
            resume_bytes=src.read_bytes() if is_pdf else None,
            resume_text=None if is_pdf else src.read_text(encoding="utf-8", errors="replace"),
            is_pdf=is_pdf, provider=provider, model=model,
        )
    except (LLMError, ValueError) as e:
        print(f"profile extraction failed: {e}")
        return 1

    out.write_text(json.dumps(profile, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out}\n")
    print(json.dumps(profile, indent=2, ensure_ascii=False)[:900])
    return 0
