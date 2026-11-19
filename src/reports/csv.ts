import fs from 'node:fs';
import path from 'node:path';

export const OUTPUT_ROOT = path.resolve('output');
/** Wellfound, Instahyre and Indeed auto-apply results: output/autoapply/<site>/. */
export const AUTOAPPLY_ROOT = path.join(OUTPUT_ROOT, 'autoapply');

const FAILED_HEADER = ['Date', 'Company', 'Role', 'Reason', 'URL'];
const REASON_COL    = FAILED_HEADER.indexOf('Reason');

function escape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toLine(cells: string[]): string {
  return cells.map(escape).join(',');
}

/** Every record of a CSV text; a quoted cell may span lines. */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); records.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); records.push(row); }
  return records;
}

/** Header + data rows of a CSV, stopping at the first blank line (e.g. failed.csv's summary block). */
export function readTable(file: string): { header: string[]; rows: string[][] } {
  if (!fs.existsSync(file)) return { header: [], rows: [] };
  const [header = [], ...rest] = parseRecords(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const rows: string[][] = [];
  for (const r of rest) {
    if (r.length === 1 && !r[0].trim()) break;
    rows.push(r);
  }
  return { header, rows };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** passed.csv / failed.csv writer for one site, under output/autoapply/<site>/. */
export function createReport(site: string, passedHeader: string[]) {
  const dir    = path.join(AUTOAPPLY_ROOT, site);
  const passed = path.join(dir, 'passed.csv');
  const failed = path.join(dir, 'failed.csv');

  return {
    PASSED_CSV: passed,
    FAILED_CSV: failed,

    appendPassed(row: string[]): void {
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(passed)) fs.writeFileSync(passed, toLine(passedHeader) + '\n');
      fs.appendFileSync(passed, toLine(row) + '\n');
    },

    /**
     * Appends a failure and rewrites the file so the "Reason,Total" block at the
     * bottom always reflects every row (across all runs).
     */
    appendFailed(row: string[]): void {
      fs.mkdirSync(dir, { recursive: true });
      const rows = [...readTable(failed).rows, row];

      const totals = new Map<string, number>();
      for (const r of rows) totals.set(r[REASON_COL], (totals.get(r[REASON_COL]) ?? 0) + 1);
      const sorted = [...totals].sort((a, b) => b[1] - a[1]);

      const out = [
        toLine(FAILED_HEADER),
        ...rows.map(toLine),
        '',
        toLine(['Reason', 'Total']),
        ...sorted.map(([reason, n]) => toLine([reason, String(n)])),
        toLine(['All failures', String(rows.length)]),
      ];
      fs.writeFileSync(failed, out.join('\n') + '\n');
    },
  };
}
