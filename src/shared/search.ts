/**
 * Search mode, shared by every bot: `pnpm start:<bot>-search`.
 *
 * Instead of you setting up a results page, the bot types each keyword below into
 * the site's own search bar (like a person), takes 10–15 jobs for that keyword,
 * applies to them, then searches the next keyword.
 *
 * Edit the keywords and the title rules here — they apply to all bots.
 */
import readline from 'readline';
import { Page } from 'playwright';
import { humanDelay } from './delay.js';
import * as log from './logger.js';

/** Typed into each site's search bar, one after another. */
export const SEARCH_KEYWORDS = [
  'backend intern',
  'software engineer intern',
  'full stack developer',
  'react developer',
  'node developer',
  'mern stack developer',
  'full stack developer intern',
  'backend developer',
];

/** A random number of jobs in this range is taken from each keyword. */
export const JOBS_PER_KEYWORD: [number, number] = [10, 15];

/**
 * Title rules — a job is applied to only when its title matches at least one include
 * and no exclude (so "Technical Support Engineer" or "HR Intern" are never applied to).
 * Started from include_titles / exclude_titles in src/jobscout/config.yaml.
 */
export const INCLUDE_TITLES: RegExp[] = [
  /\b(software|backend|back[\s-]?end|frontend|front[\s-]?end|full[\s-]?stack|web|platform|systems|cloud)\b.*\b(engineer|developer)\b/i,
  /\b(engineer|developer)\b.*\b(software|backend|back[\s-]?end|frontend|front[\s-]?end|full[\s-]?stack|web|platform|systems|cloud)\b/i,
  /\b(react|node(\.?js)?|mern|javascript|typescript)\b.*\b(developer|engineer)?\b/i,
  /\b(python|django|ai|ml|machine learning|gen[\s-]?ai|llm)\b.*\b(developer|engineer)\b/i,
  /\b(software|sde|engineer(ing)?|developer|development|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web|ai|ml|data|tech(nology)?|cloud|devops|python|react|node|java(script)?|programming|computer)\b.*\bintern(ship)?s?\b/i,
  /\bintern(ship)?s?\b.*\b(software|sde|engineer(ing)?|developer|development|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web|ai|ml|data|tech(nology)?|cloud|devops|python|react|node|java(script)?|programming|computer)\b/i,
  /\bsde\b/i,
  /\bmember of technical staff\b/i,
  /\bsite reliability engineer\b|\bsre\b/i,
  /\b(graduate|new[\s-]?grad|fresher|junior|associate|entry[\s-]?level|trainee)\b.*\b(engineer|developer|sde)\b/i,
  /\b(engineer|developer|sde)\b.*\b(graduate|new[\s-]?grad|fresher|junior|associate|entry[\s-]?level|trainee)\b/i,
  /\bsoftware development engineer\b/i,
  /\b(programmer analyst|application developer|python developer)\b/i,
  /\b(web|mern|mean|full[\s-]?stack|frontend|front[\s-]?end)\s+(developer|engineer|dev)\b/i,
  /\bjunior\s+(web|software|full[\s-]?stack|frontend|backend)\b/i,
];

export const EXCLUDE_TITLES: RegExp[] = [
  /\b(staff|principal|distinguished|fellow|architect)\b/i,
  /\bsenior\b/i,
  /\b(ii|iii|iv|lead|sr|intermediate|mid[\s-]?level)\b/i,
  /\b(sde|engineer|developer)\s*-?\s*[2-9]\b/i,
  /\b(director|vp|vice president|head of|chief|cto)\b/i,
  /\b(manager|management)\b/i,
  /\bapprentice\b/i,
  /\b(sales|account executive|marketing|recruit|support|success)\b/i,
  /\b(ios|android|mobile|flutter|react[\s-]?native|game|designer)\b/i,
  /\bbusiness development\b|\boperations\b/i,
  /\b(electronics|electrical|mechanical|civil|chemical)\b/i,
  /\b(test(ing)?|qa|quality assurance)\b/i,
  /\b(data scientist|machine learning scientist|research scientist)\b/i,
  /\bwalk[\s-]?in\b/i,   // walk-in interviews have no Apply button
];

/** True when the title hits EXCLUDE_TITLES (senior, manager, sales, mobile, walk-in…). */
export function titleExcluded(title: string): boolean {
  return EXCLUDE_TITLES.some((re) => re.test(title));
}

/** True when the title passes INCLUDE_TITLES / EXCLUDE_TITLES. */
export function titleWanted(title: string): boolean {
  return INCLUDE_TITLES.some((re) => re.test(title)) && !titleExcluded(title);
}

/** `pnpm start:<bot>-search` passes --search. */
export function isSearchMode(): boolean {
  return process.argv.includes('--search');
}

/** `--max 3` stops after that many applications; `fallback` when not given. */
export function maxApplications(fallback = Number.POSITIVE_INFINITY): number {
  const i = process.argv.indexOf('--max');
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Random job count for one keyword, within JOBS_PER_KEYWORD. */
export function jobsForKeyword(): number {
  const [lo, hi] = JOBS_PER_KEYWORD;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Where a site's search bar is. Each selector may list several alternatives. */
export interface SearchBox {
  /** The keyword input. The first visible match is used. */
  input:   string;
  /** Clicked after Enter, for sites where Enter alone doesn't search. */
  submit?: string;
  /** Clicked first, for search bars that are collapsed behind a button. */
  expand?: string;
  /** Remove buttons of keyword tags left from the previous search (tag-style inputs). */
  clearTags?: string;
}

/**
 * Types `keyword` into the site's search bar and presses Enter, like a person.
 * Returns true once the page URL changes (the results for the new search).
 */
export async function typeSearch(page: Page, keyword: string, box: SearchBox): Promise<boolean> {
  const before = page.url();
  const visible = (sel: string) => page.locator(sel).filter({ visible: true }).first();

  if (box.expand) {
    const expand = visible(box.expand);
    if (await expand.count().catch(() => 0)) {
      await expand.click().catch(() => undefined);
      await humanDelay(1000);
    }
  }

  if (box.clearTags) {
    for (let i = 0; i < 30; i++) {
      const remove = visible(box.clearTags);
      if (!(await remove.count().catch(() => 0))) break;
      await remove.click().catch(() => undefined);
      await humanDelay(400);
    }
  }

  const input = visible(box.input);
  if (!(await input.count().catch(() => 0))) return false;

  try {
    // focus(), not click(): placeholders and sticky headers often sit on top of the box.
    await input.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(keyword, { delay: 60 + Math.floor(Math.random() * 60) });
    await humanDelay(1000);
    await page.keyboard.press('Enter');

    // Enter alone doesn't always search (tag inputs, autocomplete lists): then click the button.
    if (box.submit && !(await urlChanged(page, before, 4000))) {
      const submit = visible(box.submit);
      if (await submit.count().catch(() => 0)) {
        await submit.click().catch(() => submit.click({ force: true }).catch(() => undefined));
      }
    }
  } catch {
    return false;
  }

  return urlChanged(page, before, 15000);
}

function urlChanged(page: Page, before: string, timeout: number): Promise<boolean> {
  return page
    .waitForURL((u) => u.href !== before, { timeout })
    .then(() => true)
    .catch(() => false);
}

/** Last resort when the search bar can't be used: you search by hand, the bot carries on. */
export function searchByHand(keyword: string): Promise<void> {
  log.warn(`Couldn't use the search bar — search for "${keyword}" in the browser yourself.`);
  process.stdout.write('\x07');
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('   Press ENTER when the results are showing…', () => { rl.close(); resolve(); });
  });
}

/** Types the keyword into the search bar, or asks you to search by hand if that fails. */
export async function searchFor(page: Page, keyword: string, box: SearchBox): Promise<void> {
  log.step(`Typing "${keyword}" into the search bar…`);
  if (!(await typeSearch(page, keyword, box))) await searchByHand(keyword);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await humanDelay(2500);
}
