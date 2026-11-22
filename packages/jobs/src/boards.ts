// Readers for the public job-board APIs that companies' careers pages run on. Ported from
// the jobscout tool on the feat/jobapplier branch (services/boards.py, by ayoszdeep).
// Only official, unauthenticated "list our open jobs" endpoints: no scraping.
//
// Each reader takes a board's decoded JSON and returns Postings. Keeping parsing apart
// from HTTP is what lets the tests check every board offline with recorded replies.
import { arr, joinPlace, obj, str, stripHtml, type Json } from './text.ts';

export const ATS = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee', 'breezy', 'teamtailor'] as const;
export type Ats = (typeof ATS)[number];
export const isAts = (value: string): value is Ats => (ATS as readonly string[]).includes(value);

/** A company's board: which system it runs on and its id there (not its domain). */
export interface Board {
  ats: Ats;
  slug: string;
  name: string;
}

/** One open job, as a board lists it. */
export interface Posting {
  /** Stable across fetches: "<ats>:<slug>:<job id>". */
  id: string;
  ats: Ats;
  slug: string;
  company: string;
  title: string;
  location: string;
  url: string;
  /** Plain text. Empty for SmartRecruiters and Breezy until fillDescription() loads it. */
  description: string;
  /** ISO date or date-time, as the board gives it. */
  postedAt: string | null;
}

type Parse = (board: Board, body: unknown) => Posting[];

const posting = (board: Board, id: unknown, fields: Omit<Posting, 'id' | 'ats' | 'slug' | 'company'>): Posting => ({
  id: `${board.ats}:${board.slug}:${str(id)}`,
  ats: board.ats,
  slug: board.slug,
  company: board.name,
  ...fields,
});

const parseGreenhouse: Parse = (board, body) =>
  arr(obj(body).jobs).map((raw) => {
    const j = obj(raw);
    return posting(board, j.id, {
      title: str(j.title),
      location: str(obj(j.location).name),
      url: str(j.absolute_url),
      description: stripHtml(j.content),
      postedAt: str(j.updated_at || j.first_published) || null,
    });
  });

const parseLever: Parse = (board, body) =>
  arr(body).map((raw) => {
    const j = obj(raw);
    const cats = obj(j.categories);
    // Lever splits the description across descriptionPlain, a `lists` array and additionalPlain.
    const chunks = [str(j.descriptionPlain) || stripHtml(j.description)];
    for (const list of arr(j.lists).map(obj)) chunks.push(str(list.text), stripHtml(list.content));
    chunks.push(str(j.additionalPlain) || stripHtml(j.additional));
    const created = typeof j.createdAt === 'number' ? new Date(j.createdAt).toISOString() : null; // milliseconds
    return posting(board, j.id, {
      title: str(j.text),
      location: str(cats.location),
      url: str(j.hostedUrl || j.applyUrl),
      description: chunks.filter(Boolean).join('\n\n'),
      postedAt: created,
    });
  });

const parseAshby: Parse = (board, body) =>
  arr(obj(body).jobs)
    .map(obj)
    .filter((j) => j.isListed !== false) // unlisted drafts
    .map((j) =>
      posting(board, j.id, {
        title: str(j.title),
        location: [str(j.location), j.isRemote === true ? 'Remote' : ''].filter(Boolean).join(', '),
        url: str(j.jobUrl || j.applyUrl),
        description: str(j.descriptionPlain) || stripHtml(j.descriptionHtml),
        postedAt: str(j.publishedAt) || null,
      }),
    );

const parseWorkable: Parse = (board, body) =>
  arr(obj(body).jobs).map((raw) => {
    const j = obj(raw);
    let places = arr(j.locations)
      .map(obj)
      .filter((l) => !l.hidden)
      .map((l) => joinPlace(l.city, l.country));
    if (places.length === 0) places = [joinPlace(j.city, j.country)];
    if (j.telecommuting) places.push('Remote');
    return posting(board, j.shortcode, {
      title: str(j.title),
      location: places.filter(Boolean).join(' / '),
      url: str(j.url || j.shortlink),
      description: stripHtml(j.description),
      postedAt: str(j.published_on || j.created_at) || null,
    });
  });

const parseSmartRecruiters: Parse = (board, body) =>
  arr(obj(body).content).map((raw) => {
    const j = obj(raw);
    const loc = obj(j.location);
    let place = str(loc.fullLocation).replace(/(,\s*)+/g, ', ').replace(/^,\s*|,\s*$/g, '');
    if (loc.remote) place = joinPlace(place, 'Remote');
    return posting(board, j.id, {
      title: str(j.name),
      location: place,
      url: `https://jobs.smartrecruiters.com/${board.slug}/${str(j.id)}`,
      description: '', // not in the list: fillDescription() loads it for jobs worth keeping
      postedAt: str(j.releasedDate).slice(0, 10) || null,
    });
  });

const parseRecruitee: Parse = (board, body) =>
  arr(obj(body).offers).map((raw) => {
    const j = obj(raw);
    let place = str(j.location) || joinPlace(j.city, j.country);
    if (j.remote) place = joinPlace(place, 'Remote');
    return posting(board, j.id, {
      title: str(j.title),
      location: place,
      url: str(j.careers_url),
      description: [stripHtml(j.description), stripHtml(j.requirements)].filter(Boolean).join('\n\n'),
      // "2026-10-05 15:07:51 UTC" isn't ISO; the date is enough.
      postedAt: str(j.published_at || j.created_at).slice(0, 10) || null,
    });
  });

const parseBreezy: Parse = (board, body) =>
  arr(body).map((raw) => {
    const j = obj(raw);
    const locs = (Array.isArray(j.locations) ? j.locations : [j.location]).map(obj).filter((l) => Object.keys(l).length);
    const places = locs.map((l) => str(l.name));
    if (locs.some((l) => l.is_remote)) places.push('Remote');
    return posting(board, j.id, {
      title: str(j.name),
      location: places.filter(Boolean).join(' / '),
      url: str(j.url),
      description: '', // not in the list: fillDescription() loads it
      postedAt: str(j.published_date) || null,
    });
  });

const parseTeamtailor: Parse = (board, body) =>
  arr(obj(body).items).map((raw) => {
    const j = obj(raw);
    const jobPosting = obj(j._jobposting); // a JSON Feed item with a schema.org JobPosting inside
    const locs = Array.isArray(jobPosting.jobLocation) ? jobPosting.jobLocation : [jobPosting.jobLocation];
    const places = locs.map((loc) => {
      const a = obj(obj(loc).address);
      return joinPlace(a.addressLocality, a.addressRegion, a.addressCountry);
    });
    if (jobPosting.jobLocationType === 'TELECOMMUTE') places.push('Remote');
    return posting(board, j.id, {
      title: str(j.title),
      location: places.filter(Boolean).join(' / '),
      url: str(j.url),
      description: stripHtml(j.content_html || jobPosting.description),
      postedAt: str(j.date_published || jobPosting.datePosted) || null,
    });
  });

export const BOARDS: Record<Ats, { url: (slug: string) => string; parse: Parse }> = {
  greenhouse: { url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`, parse: parseGreenhouse },
  lever: { url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, parse: parseLever },
  ashby: { url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`, parse: parseAshby },
  workable: { url: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`, parse: parseWorkable },
  smartrecruiters: { url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`, parse: parseSmartRecruiters },
  recruitee: { url: (s) => `https://${s}.recruitee.com/api/offers/`, parse: parseRecruitee },
  breezy: { url: (s) => `https://${s}.breezy.hr/json`, parse: parseBreezy },
  teamtailor: { url: (s) => `https://${s}.teamtailor.com/jobs.json`, parse: parseTeamtailor },
};

export const parseBoard = (board: Board, body: unknown): Posting[] =>
  BOARDS[board.ats].parse(board, body).filter((p) => p.title && p.url);

// ── HTTP ────────────────────────────────────────────────────────────────────

export const USER_AGENT = 'SkillBridge-job-matcher/1.0 (college project; reads public job boards)';
/** A whole board can be thousands of jobs with descriptions (tens of MB); one job page is small. */
const BOARD_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 20_000;
const MAX_PAGES = 10;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type BoardResult =
  | { kind: 'ok'; postings: Posting[] }
  /** 404/410: the company left this board or the slug is wrong. Retrying won't help. */
  | { kind: 'gone'; status: number }
  /** Anything else (5xx, 429, timeouts): worth retrying later. */
  | { kind: 'error'; status: number | null; message: string };

async function getJson(fetcher: Fetch, url: string, timeoutMs = BOARD_TIMEOUT_MS): Promise<{ status: number; body: unknown }> {
  const res = await fetcher(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: (await res.json()) as unknown };
}

/** Downloads a board (following SmartRecruiters' and Teamtailor's paging) and reads it. */
export async function fetchBoard(board: Board, fetcher: Fetch = fetch): Promise<BoardResult> {
  const url = BOARDS[board.ats].url(encodeURIComponent(board.slug));
  try {
    const first = await getJson(fetcher, url);
    if (first.status === 404 || first.status === 410) return { kind: 'gone', status: first.status };
    if (first.status !== 200) return { kind: 'error', status: first.status, message: `HTTP ${first.status}` };
    const body = first.body;

    if (board.ats === 'smartrecruiters') {
      const content = arr(obj(body).content);
      const total = Number(obj(body).totalFound) || 0;
      for (let page = 1; content.length < total && page < MAX_PAGES; page++) {
        const more = arr(obj((await getJson(fetcher, `${url}&offset=${content.length}`)).body).content);
        if (more.length === 0) break;
        content.push(...more);
      }
      (body as Json).content = content;
    }
    if (board.ats === 'teamtailor') {
      const items = arr(obj(body).items);
      let next = str(obj(body).next_url);
      for (let page = 1; next && page < MAX_PAGES; page++) {
        const more = obj((await getJson(fetcher, next)).body);
        if (arr(more.items).length === 0) break;
        items.push(...arr(more.items));
        next = str(more.next_url);
      }
      (body as Json).items = items;
    }
    return { kind: 'ok', postings: parseBoard(board, body) };
  } catch (error) {
    return { kind: 'error', status: null, message: error instanceof Error ? error.message : String(error) };
  }
}

/** The description from a page's schema.org JobPosting block (Breezy job pages carry one). */
export function ldJsonDescription(html: string): string {
  for (const match of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(match[1] ?? '');
    } catch {
      continue;
    }
    for (const item of Array.isArray(data) ? data : [data]) {
      if (obj(item)['@type'] === 'JobPosting') return stripHtml(obj(item).description);
    }
  }
  return '';
}

/**
 * Loads the description of a SmartRecruiters or Breezy job, whose lists leave it out.
 * Called only for jobs that already passed the title and location filters, to keep
 * the number of requests small. On failure the job keeps an empty description.
 */
export async function fillDescription(p: Posting, fetcher: Fetch = fetch): Promise<Posting> {
  if (p.description || (p.ats !== 'smartrecruiters' && p.ats !== 'breezy')) return p;
  try {
    if (p.ats === 'breezy') {
      const res = await fetcher(p.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
      return res.ok ? { ...p, description: ldJsonDescription(await res.text()) } : p;
    }
    const jobId = p.id.split(':').slice(2).join(':');
    const { body } = await getJson(
      fetcher,
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(p.slug)}/postings/${encodeURIComponent(jobId)}`,
      PAGE_TIMEOUT_MS,
    );
    const sections = obj(obj(obj(body).jobAd).sections);
    const description = ['jobDescription', 'qualifications', 'additionalInformation']
      .map((key) => stripHtml(obj(sections[key]).text))
      .filter(Boolean)
      .join('\n\n');
    return { ...p, description, url: str(obj(body).postingUrl) || p.url };
  } catch {
    return p;
  }
}
