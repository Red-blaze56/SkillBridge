"""Spot unpaid internship posts, so the scraper does not save them.

Many intern posts on LinkedIn / Indeed / Glassdoor pay nothing: their only
"perks" are a certificate and a letter of recommendation, the stipend is only
"performance-based, up to ₹15000", or they ask you to pay a fee. An internship
is unpaid when its description
  - says so ("unpaid", "no stipend") or asks for a fee, or
  - mentions no real pay and offers a certificate / letter of recommendation
    or a performance-only stipend instead.
A fixed stipend ("Stipend: ₹15,000 per month", "Pay: ₹2,000 - ₹10,000 per
month") is real pay, certificate or not. Full-time jobs are never checked,
and a job with no description is kept.
"""
from __future__ import annotations

import re

_INTERN = re.compile(r"\bintern(ship)?s?\b", re.I)

_SAYS_UNPAID = re.compile(
    r"\bunpaid\b|\bno\s+stipend\b|\bwithout\s+(any\s+)?stipend\b|\bstipend\s*:\s*(nil|none|n/?a)\b|"
    r"\b(registration|training|security|joining|enrol+ment|program(me)?|course|kit)\s+fees?\b|"
    r"\bpay\s+(a|the|an?\s+one[\s-]time)\s+fee\b|\bfee\s+of\s+(rs\.?|inr|₹)", re.I)

_ONLY_PERKS = re.compile(r"\bcertificate\b|\bletter\s+of\s+recommendation\b|\blor\b", re.I)

# "performance-based stipend" / "Stipend: Performance-Based, up to ₹15000/-" /
# "Stipend: Up to ₹10,000 (Performance-Based)" promise nothing
_NOT_REAL_PAY = re.compile(
    r"\bperformance[\s-]*(based|linked)\s+(stipend|incentives?|pay)\b[^.\n•*]{0,40}|"
    r"\bstipend\b[^.\n]{0,60}?\bperformance[\s-]*(based|linked)\b[^.\n]{0,40}|"
    r"\bstipend\s+(will\s+be\s+)?(based|depending|dependent)\s+on\s+(your\s+)?performance\b|"
    r"\b(may|might|could)\s+(be\s+)?(offer(ed)?|get|receive)\s+(a\s+)?stipend\b", re.I)

_PAY = re.compile(
    r"\bstipend\b|\bsalary\b|\bpaid\s+internship\b|\bcompensation\b|\bremuneration\b|\bctc\b|"
    r"\blpa\b|₹|\binr\b|\brs\.?\s*\d|\$\s*\d|\d[\d,]*\s*(k|,000)?\s*(/|per)\s*(month|mo|week)\b|"
    r"\bper\s+month\b", re.I)


def is_internship(title: str, job_type: str = "") -> bool:
    return bool(_INTERN.search(title or "")) or "internship" in (job_type or "").lower()


def is_unpaid_internship(title: str, description: str, job_type: str = "") -> bool:
    """True when this internship post looks unpaid (see the module docstring)."""
    if not description or not is_internship(title, job_type):
        return False
    if _SAYS_UNPAID.search(description):
        return True
    if _PAY.search(_NOT_REAL_PAY.sub(" ", description)):
        return False                                   # a real stipend / salary is mentioned
    return bool(_ONLY_PERKS.search(description) or _NOT_REAL_PAY.search(description))
