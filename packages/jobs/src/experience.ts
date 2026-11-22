// How many years of experience a job asks for. Ported from jobscout's experience.py
// (feat/jobapplier, by ayoszdeep).

const YRS = String.raw`(?:years?|yrs?)`;
const RANGE = new RegExp(String.raw`\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*${YRS}`, 'gi');
const PLUS = new RegExp(String.raw`\b(\d{1,2})\s*\+\s*${YRS}`, 'gi');
const PLAIN = new RegExp(String.raw`\b(\d{1,2})\s*${YRS}`, 'gi');
const EXPERIENCE_WORD = /\bexp(?:erience\w*)?\b|\bexp\./i;

/** Words that mark a job as open to freshers, in the title or the description. */
export const FRESHER = /\b(freshers?|new[\s-]?grad(uate)?s?|entry[\s-]?level|intern(ship)?s?|recent graduates?|no experience)\b/i;

/** A bare "10 years" could be the company's age, so it only counts with "experience" nearby. */
const nearExperience = (text: string, start: number, end: number) =>
  EXPERIENCE_WORD.test(text.slice(Math.max(0, start - 30), end + 25));

/** Years asked for: "0", "0-2", "1+", "3", or null when the posting doesn't say. */
export function experience(title: string, description: string): string | null {
  const text = description ?? '';
  const found: { at: number; label: string; strong: boolean }[] = [];

  for (const m of text.matchAll(RANGE)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo > 15 || hi > 20 || hi < lo) continue;
    found.push({ at: m.index, label: hi === lo ? String(lo) : `${lo}-${hi}`, strong: hi !== lo });
  }
  for (const m of text.matchAll(PLUS)) {
    const lo = Number(m[1]);
    if (lo <= 15) found.push({ at: m.index, label: `${lo}+`, strong: true });
  }
  for (const m of text.matchAll(PLAIN)) {
    const lo = Number(m[1]);
    if (lo <= 15 && nearExperience(text, m.index, m.index + m[0].length)) {
      found.push({ at: m.index, label: String(lo), strong: false });
    }
  }

  if (found.length) {
    // "2-5 years" and "3+ years" are clearer requirements than a bare number; among
    // those, the first one mentioned is usually the main requirement.
    const pool = found.some((f) => f.strong) ? found.filter((f) => f.strong) : found;
    return pool.reduce((first, f) => (f.at < first.at ? f : first)).label;
  }
  if (FRESHER.test(title) || FRESHER.test(text)) return '0';
  return null;
}

/** The fewest years the job accepts, or null when it doesn't say. */
export function minYears(label: string | null): number | null {
  const m = label?.match(/^\d+/);
  return m ? Number(m[0]) : null;
}
