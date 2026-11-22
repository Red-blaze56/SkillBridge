// Checks every company board and keeps the ones worth polling: the board is live and it
// lists at least one job in India, or one fresher-friendly developer job that is remote.
//
//   pnpm --filter @skillbridge/jobs check-companies                      re-check data/companies.json
//   pnpm --filter @skillbridge/jobs check-companies -- --from list.json  check a new list of candidates
//
// Candidates are JSON: [{ "ats": "greenhouse", "slug": "stripe", "name": "Stripe" }, ...].
// It goes slowly on purpose (a few boards at a time, with pauses): these are other
// people's servers.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fetchBoard, isAts, type Board } from '../src/boards.ts';
import { COMPANIES_FILE, type CompanyEntry } from '../src/companies.ts';
import { inIndia, isRemote, titleFits } from '../src/filters.ts';

const CONCURRENCY = 4;
const PAUSE_MS = 300;

const { values } = parseArgs({ options: { from: { type: 'string' }, out: { type: 'string' } } });
const fromFile = values.from ?? COMPANIES_FILE;
const outFile = values.out ?? COMPANIES_FILE;

const raw = JSON.parse(readFileSync(fromFile, 'utf8')) as { ats: string; slug: string; name: string }[];
const candidates: Board[] = raw.filter((c) => isAts(c.ats) && c.slug).map((c) => ({ ats: c.ats as Board['ats'], slug: c.slug, name: c.name }));
console.log(`Checking ${candidates.length} boards from ${fromFile}, ${CONCURRENCY} at a time…`);

const kept: CompanyEntry[] = [];
const tally = { gone: 0, errors: 0, irrelevant: 0 };
const errors: string[] = [];
let next = 0;
let done = 0;

async function worker() {
  for (let i = next++; i < candidates.length; i = next++) {
    const board = candidates[i]!;
    const result = await fetchBoard(board);
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${candidates.length}`);
    if (result.kind === 'gone') tally.gone++;
    else if (result.kind === 'error') {
      tally.errors++;
      errors.push(`${board.ats}:${board.slug} ${result.message}`);
    } else {
      const india = result.postings.filter((p) => inIndia(p)).length;
      const fresherFit = result.postings.filter((p) => titleFits(p.title) && (inIndia(p) || isRemote(p))).length;
      if (india > 0 || fresherFit > 0) {
        kept.push({ ...board, open: result.postings.length, india, fresherFit, checkedAt: new Date().toISOString().slice(0, 10) });
      } else tally.irrelevant++;
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

kept.sort((a, b) => b.fresherFit - a.fresherFit || b.india - a.india || a.name.localeCompare(b.name));
writeFileSync(outFile, `${JSON.stringify(kept, null, 1)}\n`);

console.log(`
Kept ${kept.length} of ${candidates.length} boards → ${outFile}
  gone (404/410):          ${tally.gone}
  no India or remote jobs: ${tally.irrelevant}
  errors:                  ${tally.errors}
  fresher-fit jobs now:    ${kept.reduce((n, c) => n + c.fresherFit, 0)} on ${kept.filter((c) => c.fresherFit > 0).length} boards`);
if (errors.length) console.log(`Errors (left out; re-check later):\n  ${errors.slice(0, 20).join('\n  ')}`);
