export type RoleType = 'Full Stack' | 'Backend' | 'Frontend' | 'React' | 'SDE' | 'Other';

// Same order and rules as role_category in src/jobscout/jobhunt/services/experience.py.
const ROLE_PATTERNS: [RoleType, RegExp][] = [
  ['Full Stack', /\bfull[\s-]?stack\b|\bmern\b|\bmean stack\b/i],
  ['Backend',    /\bback[\s-]?end\b|\bnode(\.?js)?\b|\bdjango\b|\bspring\b|\bapi\b/i],
  ['Frontend',   /\bfront[\s-]?end\b|\bui engineer\b/i],
  ['React',      /\breact( native)?\b|\bnext\.?js\b/i],
  ['SDE',        /\bsde\b|\bsoftware (engineer|developer|development engineer)\b|\bdeveloper\b/i],
];

function matchRole(text: string): RoleType | null {
  for (const [type, re] of ROLE_PATTERNS) if (re.test(text)) return type;
  return null;
}

/** Role category from the title, falling back to the description. */
export function roleCategory(title: string, body = ''): RoleType {
  return matchRole(title) ?? matchRole(body) ?? 'Other';
}

// ─── Wellfound-style experience tag ──────────────────────────────────────────

export type ExperienceTag = 'Fresher / 0-2 yrs' | 'Senior / 3+ yrs' | 'Not mentioned';

const SENIOR_YEARS_RE = /\b([3-9]|1\d)\s*\+?\s*((-|to)\s*\d+\s*)?(years?|yrs?)\b/i;
// Words like "senior"/"lead" only count in the title — descriptions mention them casually.
const SENIOR_TITLE_RE = /\b(senior|sr|lead|staff|principal|architect|head|manager)\b/i;
const FRESHER_RE      = /\b(fresher|freshers|entry[\s-]?level|intern(ship)?|junior|jr|graduate|new grad)\b|\b[0-2]\s*((-|to)\s*[1-2]\s*)?\+?\s*(years?|yrs?)\b/i;

export function experienceTag(title: string, body = ''): ExperienceTag {
  if (SENIOR_TITLE_RE.test(title) || SENIOR_YEARS_RE.test(title)) return 'Senior / 3+ yrs';
  if (FRESHER_RE.test(title) || FRESHER_RE.test(body)) return 'Fresher / 0-2 yrs';
  if (SENIOR_YEARS_RE.test(body)) return 'Senior / 3+ yrs';
  return 'Not mentioned';
}

// ─── Minimum years asked (Instahyre's 0–2 yr rule) ───────────────────────────

const YRS = '(?:years?|yrs?)';
const RANGE_RE   = new RegExp(`\\b(\\d{1,2})\\s*(?:-|–|to)\\s*(\\d{1,2})\\s*\\+?\\s*${YRS}`, 'i');
const PLUS_RE    = new RegExp(`\\b(\\d{1,2})\\s*\\+\\s*${YRS}`, 'i');
const PLAIN_RE   = new RegExp(`\\b(\\d{1,2})\\s*${YRS}\\b`, 'i');
const FRESHER_WORD_RE = /\b(fresher|freshers|entry[\s-]?level|new[\s-]?grad(uate)?|no experience)\b/i;

export interface YearsAsked {
  /** Minimum years asked, or null when the text doesn't say. */
  min:   number | null;
  label: string;
}

/** Reads the experience requirement from text like "1 - 3 Years", "5+ yrs", "Fresher". */
export function yearsAsked(text: string): YearsAsked {
  const range = text.match(RANGE_RE);
  if (range) return { min: Number(range[1]), label: `${range[1]}-${range[2]} yrs` };
  const plus = text.match(PLUS_RE);
  if (plus) return { min: Number(plus[1]), label: `${plus[1]}+ yrs` };
  if (FRESHER_WORD_RE.test(text)) return { min: 0, label: 'Fresher' };
  const plain = text.match(PLAIN_RE);
  if (plain) return { min: Number(plain[1]), label: `${plain[1]} yrs` };
  return { min: null, label: 'Not mentioned' };
}
