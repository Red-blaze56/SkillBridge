/**
 * Application-question answers shared by Naukri, Indeed and Glassdoor
 * ("notice period?", "willing to relocate?", "expected CTC?").
 *
 * 1. Your own answers, per bot, in data/<bot>_answers.json (Naukri learns them when you
 *    answer in the browser; for Indeed / Glassdoor add answers from output/missing_questions.json).
 * 2. Else the built-in defaults below (DEFAULT_RULES) — edit them to change an answer everywhere.
 */
import fs from 'node:fs';
import path from 'node:path';

export type Answers = Record<string, string>;

/** data/<bot>_answers.json */
export function answersFile(bot: string): string {
  return path.resolve('data', `${bot}_answers.json`);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function loadAnswers(bot: string): Answers {
  try {
    return JSON.parse(fs.readFileSync(answersFile(bot), 'utf8')) as Answers;
  } catch {
    return {};
  }
}

export function saveAnswer(bot: string, answers: Answers, question: string, answer: string): void {
  answers[question] = answer;
  fs.mkdirSync(path.dirname(answersFile(bot)), { recursive: true });
  fs.writeFileSync(answersFile(bot), `${JSON.stringify(answers, null, 2)}\n`);
}

/** Letter pairs of a string, for a fuzzy match that survives small wording changes. */
function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function similarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  let overlap = 0, total = 0;
  for (const [g, n] of A) { overlap += Math.min(n, B.get(g) ?? 0); total += n; }
  for (const n of B.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

/**
 * Saved answer for this question: same words first, else a question that is
 * at least 85% alike ("What is your notice period?" ≈ "Your notice period?").
 */
export function findAnswer(answers: Answers, question: string): string | null {
  const q = norm(question);
  let best: [number, string] | null = null;
  for (const [saved, answer] of Object.entries(answers)) {
    const s = norm(saved);
    if (s === q) return answer;
    const score = similarity(s, q);
    if (score >= 0.85 && (!best || score > best[0])) best = [score, answer];
  }
  return best?.[1] ?? null;
}

// ── Default answers ─────────────────────────────────────────────────────────
//
// Used when there's no saved answer yet. First matching rule wins. For multiple-choice
// questions an answer like "Remote, Hybrid, Yes" means: pick "Remote" if it's an option,
// else "Hybrid", else "Yes". Edit freely — your own answers in data/<bot>_answers.json
// always come first.

/** Your expected CTC in lakhs per year. */
const EXPECTED_CTC_LAKHS = 4;
/** Your current stipend per month (rupees). */
const CURRENT_STIPEND_MONTHLY = 16000;
/** Where you live (typed into "current location" text boxes). */
const HOME_CITY = 'Greater Noida, Uttar Pradesh';
/** Cities you can work in without relocating. */
const NEAR_HOME = /noida|delhi|\bncr\b|gurgaon|gurugram|ghaziabad|faridabad/;

/** Number-only question ("in days", "in months", "in lakhs", "numeric")? */
const wantsNumber = (q: string) => /\b(in|number of) (days|months|years|lakhs?|lpa|lacs?|rupees|inr)\b|\bnumeric\b|\bnumber\b/.test(q);
const inLakhs = (q: string) => /lakh|lac|lpa/.test(q);
const perMonth = (q: string) => /month/.test(q);

const DEFAULT_RULES: [RegExp, (q: string) => string][] = [
  // Fresher: years of experience (total, or in any skill: "How many years of React experience?").
  [/(total|how many) years of\b.*\bexperience|years of (work )?experience|experience in years/, () => '0'],
  // Allowed to work in India / speaks English.
  [/authori[sz]ed to work|legally (eligible|allowed|authori[sz]ed)|eligible to work|work permit/, () => 'Yes'],
  [/speak english|english (proficiency|fluency|level)|fluent in english|comfortable (communicating|speaking) in english/, () => 'Fluent, Yes'],
  // Commute to the office (Indeed: "Yes, I can make the commute").
  [/commute|reliably (commute|travel)/, () => 'Yes'],
  // Relocation — yes, and yes to relocation bonus / assistance.
  [/relocat/, () => 'Yes'],
  // Where you live: Greater Noida (UP). City options: Greater Noida → Noida → Delhi / NCR → Gurgaon.
  // "Are you based in Bangalore?" → No (but "…or willing to relocate?" is caught above → Yes).
  [/current (location|city)|where are you (located|based|living|currently)|your (current )?(location|city)|located in|based (in|out of)|resid(e|ing)|home ?town|which city|preferred (location|city)/, (q) =>
    (/^(are|is|do|does|will|would|can)\b/.test(q.trim())
      ? (NEAR_HOME.test(q) ? 'Yes' : 'No')
      : `${HOME_CITY}, Greater Noida, Noida, Delhi NCR, Delhi, NCR, Gurgaon, Gurugram`)],
  // Notice period / joining — immediate (within 7 days).
  [/notice period|serving notice/, (q) => (wantsNumber(q) || /how many days/.test(q) ? '7' : 'Immediate, 15 days or less, 0, 7 days, Yes')],
  [/\bjoin(ing)?\b.*\b(when|how soon|earliest|immediate|date|days)\b|\b(when|how soon|earliest)\b.*\bjoin/, (q) =>
    (wantsNumber(q) || /how many days/.test(q) ? '7' : 'Immediately, Immediate, Yes')],
  [/immediate(ly)? join|join immediately/, () => 'Yes'],
  // Probation — fine with it.
  [/probation/, () => 'Yes'],
  // Internship — done one, 3 months.
  [/internship/, (q) => (/how long|duration|how many months|months/.test(q) ? '3' : 'Yes')],
  // Salary.
  [/expected (ctc|salary|package|compensation|stipend)|salary expectation/, (q) =>
    (inLakhs(q) ? String(EXPECTED_CTC_LAKHS) : perMonth(q) ? String(Math.round(EXPECTED_CTC_LAKHS * 100000 / 12)) : String(EXPECTED_CTC_LAKHS * 100000))],
  [/current (ctc|salary|package|compensation|stipend)|present (ctc|salary)/, (q) =>
    (perMonth(q) ? String(CURRENT_STIPEND_MONTHLY) : inLakhs(q) ? String(+(CURRENT_STIPEND_MONTHLY * 12 / 100000).toFixed(2)) : String(CURRENT_STIPEND_MONTHLY * 12))],
  // Work mode — remote first, hybrid and office are fine too.
  // ("Are you comfortable with hybrid?" → Yes; "Preferred work mode?" → Remote.)
  [/work mode|preferred mode|remote|hybrid|work from (home|office)|\bwfo\b|\bwfh\b|on-?site|in office/, (q) =>
    (/^(are|is|will|would|can|could|do|does)\b/.test(q.trim()) ? 'Yes, Remote, Hybrid' : 'Remote, Hybrid, Yes')],
];

/** Your built-in default for this question, or null if no rule matches. */
export function defaultAnswer(question: string): string | null {
  const q = question.toLowerCase();
  for (const [re, answer] of DEFAULT_RULES) if (re.test(q)) return answer(q);
  return null;
}

/**
 * Index of the option to pick for `answer` ("Remote, Hybrid, Yes" = in that order of
 * preference): an exact label first, else a label that starts with it ("Yes, I can relocate").
 */
export function pickOption(options: string[], answer: string): number {
  const opts = options.map((o) => o.trim().toLowerCase());
  for (const want of answer.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    const exact = opts.indexOf(want);
    if (exact >= 0) return exact;
    const starts = opts.findIndex((o) => o.startsWith(want) && !/[a-z]/.test(o.charAt(want.length)));
    if (starts >= 0) return starts;
  }
  return -1;
}
