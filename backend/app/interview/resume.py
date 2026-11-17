"""Resume PDF -> clean text (minimal).

Reads page text only (never metadata); sanitises control/format chars (incl. the RLO
override) while keeping the zero-widths Indic/Persian need. Returns None when little/no
text comes out (scanned PDF) — the OCR/vision path can be added later on this same lib.

No hidden-text filter by design: the real injection defense is that only the extracted
AGENDA (not this text) reaches grading, plus prompt fencing. Revisit only if this ever
becomes recruiter-facing.
"""
import re
import unicodedata

import pypdfium2 as pdfium

MAX_PAGES = 5
MAX_CHARS = 20_000
MAX_BYTES = 10 * 1024 * 1024

_KEEP = {"\n", "\t", " ", "‌", "‍"}          # zero-widths Indic/Persian need
_DROP = {"Cc", "Cf", "Co", "Cs", "Cn", "Zl", "Zp"}     # control/format incl. RLO override


class ResumeParseError(ValueError):
    """Bad or unreadable PDF; message is safe to show the user."""


def _sanitize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = "".join(c for c in text if c in _KEEP or unicodedata.category(c) not in _DROP)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_resume_text(data: bytes) -> str | None:
    if len(data) > MAX_BYTES or b"%PDF-" not in data[:1024]:
        raise ResumeParseError("Please upload a PDF under 10 MB.")
    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as exc:
        raise ResumeParseError("Could not read this PDF.") from exc
    try:
        pages = min(len(pdf), MAX_PAGES)               # capture before close
        parts = []
        for i in range(pages):
            page = pdf[i]
            tp = page.get_textpage()
            try:
                parts.append(tp.get_text_range())
            finally:
                tp.close()
                page.close()
    finally:
        pdf.close()
    text = _sanitize("\n".join(parts))
    if len(text) < 100 * max(1, pages):                # ~no text -> scanned -> OCR path (v2)
        return None
    return text[:MAX_CHARS]
