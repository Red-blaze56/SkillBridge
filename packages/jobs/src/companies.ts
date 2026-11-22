// The company boards the jobs worker polls. Built and re-checked with
// `pnpm --filter @skillbridge/jobs check-companies`; started from the jobscout company
// lists on the feat/jobapplier branch (by ayoszdeep).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Board } from './boards.ts';

export const COMPANIES_FILE = fileURLToPath(new URL('../data/companies.json', import.meta.url));

export interface CompanyEntry extends Board {
  /** Open jobs on the board when it was last checked. */
  open: number;
  /** Of those, how many were in India. */
  india: number;
  /** Developer jobs for freshers, in India or remote. */
  fresherFit: number;
  /** YYYY-MM-DD */
  checkedAt: string;
}

export function loadCompanies(file = COMPANIES_FILE): Board[] {
  const entries = JSON.parse(readFileSync(file, 'utf8')) as CompanyEntry[];
  return entries.map(({ ats, slug, name }) => ({ ats, slug, name }));
}
