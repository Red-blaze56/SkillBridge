// Which postings suit a fresher in India: a developer title, in India or remote, at
// most a year's experience, and recent. Ported from jobscout's filters.py and the title
// and location rules in its config.yaml (feat/jobapplier, by ayoszdeep).
import type { Posting } from './boards.ts';
import { experience, FRESHER, minYears } from './experience.ts';

const INCLUDE_TITLES = [
  String.raw`\b(software|backend|back[\s-]?end|frontend|front[\s-]?end|full[\s-]?stack|web|platform|systems|cloud)\b.*\b(engineer|developer)\b`,
  String.raw`\b(engineer|developer)\b.*\b(software|backend|back[\s-]?end|frontend|front[\s-]?end|full[\s-]?stack|web|platform|systems|cloud)\b`,
  String.raw`\b(react|node\.?js|mern|javascript|typescript)\b.*\b(developer|engineer)\b`,
  String.raw`\b(python|django|ai|ml|machine learning|gen[\s-]?ai|llm)\b.*\b(developer|engineer)\b`,
  String.raw`\b(software|sde|engineer(ing)?|developer|development|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web|ai|ml|data|tech(nology)?|cloud|devops|python|react|node|java(script)?|programming|computer)\b.*\bintern(ship)?s?\b`,
  String.raw`\bintern(ship)?s?\b.*\b(software|sde|engineer(ing)?|developer|development|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web|ai|ml|data|tech(nology)?|cloud|devops|python|react|node|java(script)?|programming|computer)\b`,
  String.raw`\bsde\b`,
  String.raw`\bmember of technical staff\b`,
  String.raw`\b(graduate|new[\s-]?grad|fresher|junior|associate|entry[\s-]?level|trainee)\b.*\b(engineer|developer|sde)\b`,
  String.raw`\b(engineer|developer|sde)\b.*\b(graduate|new[\s-]?grad|fresher|junior|associate|entry[\s-]?level|trainee)\b`,
  String.raw`\bsoftware development engineer\b`,
  String.raw`\b(programmer analyst|application developer|python developer)\b`,
  String.raw`\b(web|mern|mean|full[\s-]?stack|frontend|front[\s-]?end)\s+(developer|engineer|dev)\b`,
].map((p) => new RegExp(p, 'i'));

const EXCLUDE_TITLES = [
  String.raw`\b(staff|principal|distinguished|fellow|architect)\b`,
  String.raw`\bsenior\b`,
  String.raw`\b(ii|iii|iv|lead|sr|intermediate|mid[\s-]?level)\b`, // above fresher: Engineer II, Lead, Sr
  String.raw`\b(sde|engineer|developer)\s*-?\s*[2-9]\b`,
  String.raw`\b(director|vp|vice president|head of|chief|cto)\b`,
  String.raw`\b(manager|management)\b`,
  String.raw`\bapprentice\b`,
  String.raw`\b(sales|account executive|marketing|recruit|support|success)\b`,
  String.raw`\b(ios|android|mobile|game|designer)\b`,
  String.raw`\b(machine learning scientist|research scientist)\b`,
].map((p) => new RegExp(p, 'i'));

/** Whole words, so "india" doesn't match "Indiana". */
const INDIA = new RegExp(
  String.raw`\b(${[
    'india', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'chennai', 'delhi', 'new delhi', 'noida',
    'greater noida', 'gurugram', 'gurgaon', 'ghaziabad', 'kolkata', 'ahmedabad', 'jaipur', 'lucknow', 'kanpur',
    'agra', 'jhansi', 'indore', 'chandigarh', 'mohali', 'kochi', 'coimbatore', 'bhubaneswar', 'nagpur', 'surat',
    'vadodara', 'mysuru', 'mysore', 'visakhapatnam', 'thiruvananthapuram', 'trivandrum', 'bhopal', 'dehradun',
  ].join('|')})\b`,
  'i',
);
/** Checked against the location only: "Distributed Systems Engineer" is not remote. */
const REMOTE = /\b(remote|anywhere|work from home|wfh)\b/i;

export const MAX_EXPERIENCE_YEARS = 1;
export const MAX_AGE_DAYS = 45;

export type DropReason = 'title' | 'location' | 'experience' | 'age';

export const titleFits = (title: string) =>
  INCLUDE_TITLES.some((p) => p.test(title)) && !EXCLUDE_TITLES.some((p) => p.test(title));

export const inIndia = (p: Pick<Posting, 'title' | 'location'>) => INDIA.test(p.location) || INDIA.test(p.title);
export const isRemote = (p: Pick<Posting, 'location'>) => REMOTE.test(p.location);

/** Too many years asked for? Unknown until the description is loaded; "Intern" in the title wins. */
export function tooExperienced(p: Pick<Posting, 'title' | 'description'>, maxYears = MAX_EXPERIENCE_YEARS): boolean {
  if (!p.description || FRESHER.test(p.title)) return false;
  const years = minYears(experience(p.title, p.description));
  return years !== null && years > maxYears;
}

function postedAt(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Why a posting is left out, or null to keep it. Cheap checks first. */
export function dropReason(p: Posting, now: Date = new Date()): DropReason | null {
  if (!titleFits(p.title)) return 'title';
  if (!inIndia(p) && !isRemote(p)) return 'location'; // anywhere in India, or remote from anywhere
  if (tooExperienced(p)) return 'experience';
  const posted = postedAt(p.postedAt);
  if (posted && now.getTime() - posted.getTime() > MAX_AGE_DAYS * 86_400_000) return 'age';
  return null;
}

/** Same company and same title count as one job, whichever city or board lists it (dedup.py). */
export function fingerprint(company: string, title: string): string {
  const clean = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const name = company
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "Electronic Arts (EA)" is "Electronic Arts"
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|corp|corporation)\b/g, ' ');
  return `${clean(name)}|${clean(title.toLowerCase())}`;
}
