"""How many years a job asks for, and which kind of role it is (Full Stack, Backend, ...)."""
from __future__ import annotations

import re

# Same order and rules as classifyJob in src/bots/wellfound/jobs.ts.
ROLE_PATTERNS = [
    ("Full Stack", re.compile(r"\bfull[\s-]?stack\b|\bmern\b|\bmean stack\b", re.I)),
    ("Backend",    re.compile(r"\bback[\s-]?end\b|\bnode(\.?js)?\b|\bdjango\b|\bspring\b|\bapi\b", re.I)),
    ("Frontend",   re.compile(r"\bfront[\s-]?end\b|\bui engineer\b", re.I)),
    ("React",      re.compile(r"\breact( native)?\b|\bnext\.?js\b", re.I)),
    ("SDE",        re.compile(r"\bsde\b|\bsoftware (engineer|developer|development engineer)\b|\bdeveloper\b", re.I)),
]

_YRS = r"(?:years?|yrs?)"
_RANGE = re.compile(rf"\b(\d{{1,2}})\s*(?:-|–|to)\s*(\d{{1,2}})\s*\+?\s*{_YRS}", re.I)
_PLUS  = re.compile(rf"\b(\d{{1,2}})\s*\+\s*{_YRS}", re.I)
_PLAIN = re.compile(rf"\b(\d{{1,2}})\s*{_YRS}", re.I)
_FRESHER = re.compile(r"\b(fresher|freshers|new[\s-]?grad(uate)?|entry[\s-]?level|"
                      r"intern(ship)?|recent graduate|no experience)\b", re.I)


def role_category(title: str, description: str) -> str:
    for text in (title, description):
        for name, pattern in ROLE_PATTERNS:
            if pattern.search(text or ""):
                return name
    return "Other"


_EXP_WORD = re.compile(r"\bexp(?:erience\w*)?\b|\bexp\.", re.I)


def _near_experience(text: str, start: int, end: int) -> bool:
    return bool(_EXP_WORD.search(text[max(0, start - 30):end + 25]))


def experience(title: str, description: str) -> str:
    """Years asked for, as '0', '0-2', '1+', '3'… or 'Not mentioned'."""
    text = description or ""
    found: list[tuple[int, str]] = []
    for pattern, fmt in ((_RANGE, "range"), (_PLUS, "plus"), (_PLAIN, "plain")):
        for m in pattern.finditer(text):
            lo = int(m.group(1))
            if lo > 15:
                continue
            # "2-5 years" / "3+ years" read as requirements on their own; a bare
            # "10 years" could be company age, so it needs "experience" nearby.
            if fmt == "plain" and not _near_experience(text, m.start(), m.end()):
                continue
            if fmt == "range":
                hi = int(m.group(2))
                if hi > 20 or hi < lo:
                    continue
                label = f"{lo}-{hi}" if hi != lo else str(lo)  # Naukri: "0-0 Yrs"
            elif fmt == "plus":
                label = f"{lo}+"
            else:
                label = str(lo)
            found.append((m.start(), label))
    if found:
        # Ranges and "N+" are clearer requirements than a bare number, so they
        # win; within a group, the first one mentioned is usually the core one.
        strong = [f for f in found if not f[1].isdigit()]
        return min(strong or found)[1]
    if _FRESHER.search(title or "") or _FRESHER.search(text):
        return "0"
    return "Not mentioned"
