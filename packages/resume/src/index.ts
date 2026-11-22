// Resume PDF → numbered passages, with hidden text removed and quality checked.
// No AI is involved: every step is deterministic and testable.
import type { HiddenText, Passage, ResumeQuality } from '@skillbridge/shared';
import { readingOrder, type Line } from './layout.ts';
import { readPdf } from './pdf.ts';
import { checkQuality } from './quality.ts';
import { toPassages } from './sections.ts';
import { hiddenReason } from './visibility.ts';

export { PdfError, type PdfErrorCode } from './pdf.ts';
export { MIN_CONTRAST, MIN_FONT_SIZE } from './visibility.ts';

export const MAX_PAGES = 5;
export const MAX_BYTES = 5 * 1024 * 1024;

export interface ParsedResume {
  pageCount: number;
  /** Columns found on each page: 1 or 2. */
  columns: number[];
  passages: Passage[];
  /** Text a reader can't see. It's left out of the passages. */
  hidden: HiddenText[];
  quality: ResumeQuality;
}

/** Unicode normalisation, and no control or direction-override characters. */
function clean(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '‌' || c === '‍' ? c : ' ')) // keep ZWNJ/ZWJ (Indic scripts)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hidden pieces next to each other on a page, with the same reason, as one entry. */
function merge(hidden: HiddenText[]): HiddenText[] {
  const out: HiddenText[] = [];
  for (const h of hidden) {
    const prev = out.at(-1);
    if (prev && prev.page === h.page && prev.reason === h.reason && prev.preview.length < 120) {
      prev.preview = `${prev.preview} ${h.preview}`.slice(0, 120);
    } else {
      out.push({ ...h, preview: h.preview.slice(0, 120) });
    }
  }
  return out;
}

export async function parseResume(
  bytes: Uint8Array,
  { maxPages = MAX_PAGES, timeoutMs = 15_000 }: { maxPages?: number; timeoutMs?: number } = {},
): Promise<ParsedResume> {
  const pages = await readPdf(bytes, { maxPages, timeoutMs });

  const lines: Line[] = [];
  const hidden: HiddenText[] = [];
  const columns: number[] = [];
  pages.forEach((page, index) => {
    const visible = page.runs.filter((run) => {
      const reason = hiddenReason(run, page.box);
      if (reason) hidden.push({ page: index + 1, reason, preview: clean(run.text) });
      return !reason;
    });
    for (const text of page.offPage) hidden.push({ page: index + 1, reason: 'off-page', preview: clean(text) });
    const order = readingOrder(visible, page.box, index + 1);
    lines.push(...order.lines.map((line) => ({ ...line, text: clean(line.text) })).filter((line) => line.text));
    columns.push(order.columns);
  });

  const { passages, headings } = toPassages(lines);
  return {
    pageCount: pages.length,
    columns,
    passages,
    hidden: merge(hidden.filter((h) => h.preview)).slice(0, 50),
    quality: checkQuality(lines, headings),
  };
}
