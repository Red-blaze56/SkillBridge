// Every board reader against replies in that board's own JSON shape. The Greenhouse,
// Lever and Ashby samples follow jobscout's dev/mock.py (feat/jobapplier).
import { describe, expect, it } from 'vitest';
import { fetchBoard, fillDescription, ldJsonDescription, parseBoard, type Board, type Fetch, type Posting } from '../src/boards.ts';
import { stripHtml } from '../src/text.ts';

const board = (ats: Board['ats'], slug = 'acme'): Board => ({ ats, slug, name: 'Acme' });

describe('stripHtml', () => {
  it('turns HTML into text, including the double-encoded HTML Greenhouse sends', () => {
    expect(stripHtml('&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;')).toBe('Build & ship\nGo');
    expect(stripHtml('<p>A</p><script>alert(1)</script><p>B&nbsp;&#8377;5L</p>')).toBe('A\nB ₹5L');
    expect(stripHtml(null)).toBe('');
  });
});

describe('board readers', () => {
  it('Greenhouse', () => {
    const [p] = parseBoard(board('greenhouse', 'acme-edge'), {
      jobs: [
        {
          id: 5501001,
          title: ' Software Engineer ',
          absolute_url: 'https://boards.greenhouse.io/acme-edge/jobs/5501001',
          location: { name: 'Bangalore, India' },
          updated_at: '2026-11-20T10:00:00-04:00',
          content: '&lt;p&gt;Work in Go and Java.&lt;/p&gt;',
        },
      ],
    });
    expect(p).toEqual({
      id: 'greenhouse:acme-edge:5501001',
      ats: 'greenhouse',
      slug: 'acme-edge',
      company: 'Acme',
      title: 'Software Engineer',
      location: 'Bangalore, India',
      url: 'https://boards.greenhouse.io/acme-edge/jobs/5501001',
      description: 'Work in Go and Java.',
      postedAt: '2026-11-20T10:00:00-04:00',
    } satisfies Posting);
  });

  it('Lever: joins the description parts and reads createdAt as milliseconds', () => {
    const [p] = parseBoard(board('lever'), [
      {
        id: 'a1',
        text: 'Backend Engineer (Go)',
        hostedUrl: 'https://jobs.lever.co/acme/a1',
        categories: { location: 'Bangalore' },
        createdAt: Date.UTC(2026, 10, 21),
        descriptionPlain: 'We run a market data pipeline.',
        lists: [{ text: 'Requirements', content: '<li>2-5 years backend experience</li>' }],
        additionalPlain: 'No take-home.',
      },
    ]);
    expect(p).toMatchObject({ id: 'lever:acme:a1', location: 'Bangalore', postedAt: '2026-11-21T00:00:00.000Z' });
    expect(p!.description).toBe('We run a market data pipeline.\n\nRequirements\n\n2-5 years backend experience\n\nNo take-home.');
  });

  it('Ashby: skips unlisted drafts', () => {
    const jobs = parseBoard(board('ashby'), {
      jobs: [
        { id: '1', title: 'Software Engineer', location: 'Bengaluru, India', isListed: true, jobUrl: 'https://x/1', descriptionPlain: 'Rust and Go.' },
        { id: '2', title: 'Software Engineer', location: 'Bengaluru, India', isListed: false, jobUrl: 'https://x/2' },
        { id: '3', title: 'Data Engineer', location: 'Pune', isRemote: true, jobUrl: 'https://x/3', descriptionHtml: '<p>SQL &amp; Python.</p>' },
      ],
    });
    expect(jobs.map((j) => j.id)).toEqual(['ashby:acme:1', 'ashby:acme:3']);
    expect(jobs[1]).toMatchObject({ location: 'Pune, Remote', description: 'SQL & Python.' });
  });

  it('Workable, SmartRecruiters, Recruitee, Breezy and Teamtailor', () => {
    expect(
      parseBoard(board('workable'), {
        jobs: [{ shortcode: 'AB12', title: 'Web Developer', url: 'https://apply.workable.com/acme/j/AB12', locations: [{ city: 'Pune', country: 'India' }, { city: 'X', hidden: true }], telecommuting: true, description: '<p>React</p>', published_on: '2026-11-01' }],
      })[0],
    ).toMatchObject({ id: 'workable:acme:AB12', location: 'Pune, India / Remote', description: 'React', postedAt: '2026-11-01' });

    expect(
      parseBoard(board('smartrecruiters', 'Acme1'), {
        content: [{ id: '744', name: 'Graduate Engineer', location: { fullLocation: 'Noida, , India', remote: false }, releasedDate: '2026-11-02T08:00:00.000Z' }],
      })[0],
    ).toMatchObject({ id: 'smartrecruiters:Acme1:744', location: 'Noida, India', url: 'https://jobs.smartrecruiters.com/Acme1/744', description: '', postedAt: '2026-11-02' });

    expect(
      parseBoard(board('recruitee'), {
        offers: [{ id: 9, title: 'Junior Developer', city: 'Delhi', country: 'India', remote: true, careers_url: 'https://acme.recruitee.com/o/junior', description: '<p>Node</p>', requirements: '<p>Git</p>', published_at: '2026-10-05 15:07:51 UTC' }],
      })[0],
    ).toMatchObject({ location: 'Delhi, India, Remote', description: 'Node\n\nGit', postedAt: '2026-10-05' });

    expect(
      parseBoard(board('breezy'), [
        { id: 'b1', name: 'Frontend Developer', url: 'https://acme.breezy.hr/p/b1', locations: [{ name: 'Remote', is_remote: true }], published_date: '2026-11-03T00:00:00Z' },
      ])[0],
    ).toMatchObject({ id: 'breezy:acme:b1', location: 'Remote / Remote', description: '' });

    expect(
      parseBoard(board('teamtailor'), {
        items: [{ id: 't1', title: 'Software Engineer Intern', url: 'https://acme.teamtailor.com/jobs/t1', content_html: '<p>Python</p>', date_published: '2026-11-04', _jobposting: { jobLocation: { address: { addressLocality: 'Mumbai', addressCountry: 'IN' } }, jobLocationType: 'TELECOMMUTE' } }],
      })[0],
    ).toMatchObject({ location: 'Mumbai, IN / Remote', description: 'Python' });
  });

  it('drops entries without a title or a link, and survives junk', () => {
    expect(parseBoard(board('greenhouse'), { jobs: [{ id: 1, title: '', absolute_url: 'x' }, { id: 2, title: 'A' }, 'junk'] })).toEqual([]);
    expect(parseBoard(board('lever'), { not: 'a list' })).toEqual([]);
  });
});

/** A stand-in fetch that answers by URL prefix and records what was asked. */
function fakeFetch(routes: Record<string, { status?: number; json?: unknown; text?: string }>) {
  const asked: string[] = [];
  const fetcher: Fetch = async (url) => {
    asked.push(url);
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) return new Response('no route', { status: 599 });
    const { status = 200, json, text } = hit[1];
    return new Response(text ?? JSON.stringify(json), { status });
  };
  return { fetcher, asked };
}

describe('fetchBoard', () => {
  it('tells a board that is gone from one that is only failing', async () => {
    expect(await fetchBoard(board('lever'), fakeFetch({ 'https://api.lever.co': { status: 404 } }).fetcher)).toEqual({ kind: 'gone', status: 404 });
    expect(await fetchBoard(board('lever'), fakeFetch({ 'https://api.lever.co': { status: 503 } }).fetcher)).toMatchObject({ kind: 'error', status: 503 });
    const broken: Fetch = async () => {
      throw new Error('timeout');
    };
    expect(await fetchBoard(board('lever'), broken)).toEqual({ kind: 'error', status: null, message: 'timeout' });
  });

  it('follows SmartRecruiters paging', async () => {
    const { fetcher, asked } = fakeFetch({
      'https://api.smartrecruiters.com/v1/companies/acme/postings?limit=100&offset=1': { json: { content: [{ id: '2', name: 'B' }] } },
      'https://api.smartrecruiters.com/v1/companies/acme/postings?limit=100': { json: { totalFound: 2, content: [{ id: '1', name: 'A' }] } },
    });
    const result = await fetchBoard(board('smartrecruiters'), fetcher);
    expect(result.kind === 'ok' && result.postings.map((p) => p.title)).toEqual(['A', 'B']);
    expect(asked).toHaveLength(2);
  });

  it('follows Teamtailor paging', async () => {
    const { fetcher } = fakeFetch({
      'https://acme.teamtailor.com/jobs.json?page=2': { json: { items: [{ id: 2, title: 'B', url: 'u2' }] } },
      'https://acme.teamtailor.com/jobs.json': { json: { items: [{ id: 1, title: 'A', url: 'u1' }], next_url: 'https://acme.teamtailor.com/jobs.json?page=2' } },
    });
    const result = await fetchBoard(board('teamtailor'), fetcher);
    expect(result.kind === 'ok' && result.postings.map((p) => p.title)).toEqual(['A', 'B']);
  });
});

describe('fillDescription', () => {
  const base = { company: 'Acme', title: 'T', location: '', postedAt: null, description: '' };

  it('loads a SmartRecruiters job from its posting endpoint', async () => {
    const { fetcher } = fakeFetch({
      'https://api.smartrecruiters.com/v1/companies/Acme1/postings/744': {
        json: { postingUrl: 'https://jobs.smartrecruiters.com/Acme1/744-graduate', jobAd: { sections: { jobDescription: { text: '<p>Java</p>' }, qualifications: { text: '<p>0-1 years</p>' } } } },
      },
    });
    const p = await fillDescription({ ...base, id: 'smartrecruiters:Acme1:744', ats: 'smartrecruiters', slug: 'Acme1', url: 'old' }, fetcher);
    expect(p).toMatchObject({ description: 'Java\n\n0-1 years', url: 'https://jobs.smartrecruiters.com/Acme1/744-graduate' });
  });

  it('reads a Breezy page’s JobPosting block, and keeps the job if that fails', async () => {
    const page = '<html><script type="application/ld+json">{"@type":"JobPosting","description":"&lt;p&gt;React and Node&lt;/p&gt;"}</script></html>';
    expect(ldJsonDescription(page)).toBe('React and Node');
    const breezy = { ...base, id: 'breezy:acme:b1', ats: 'breezy' as const, slug: 'acme', url: 'https://acme.breezy.hr/p/b1' };
    expect((await fillDescription(breezy, fakeFetch({ 'https://acme.breezy.hr': { text: page } }).fetcher)).description).toBe('React and Node');
    expect(await fillDescription(breezy, fakeFetch({}).fetcher)).toEqual(breezy);
  });
});
