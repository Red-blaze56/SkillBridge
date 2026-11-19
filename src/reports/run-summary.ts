import * as log from '../shared/logger.js';
import { buildDashboard } from './dashboard.js';

export interface RunSummary {
  appliedHeaders: string[];
  applied:        string[][];
  failed:         { company: string; role: string; reason: string }[];
  counts:         [label: string, value: number, colour?: string][];
  files:          string[];
}

let summaryPrinted = false;

/**
 * Ctrl+C in the middle of a run: prints the usual summary (applied / failed
 * tables, totals) for the jobs finished so far, then exits. The job that was
 * in progress isn't counted. A second Ctrl+C quits at once.
 *
 * Call once, as soon as the run's records exist: `summaryOnStop(() => printSummary(records))`.
 */
export function summaryOnStop(print: () => void): void {
  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping || summaryPrinted) process.exit(0);
    stopping = true;
    const job = log.currentJob();
    log.divider();
    log.warn(`Stopped with Ctrl+C${job ? ` during ${job} (not counted)` : ''} — here is everything done up to now:`);
    try {
      print();
    } catch (err) {
      log.warn(`Could not print the summary: ${(err as Error).message}`);
    }
    process.exit(0);
  });
}

/**
 * For "Press ENTER" prompts: readline swallows Ctrl+C while it waits, so pass it on
 * (summaryOnStop prints the summary) — or just quit if no run has started yet.
 */
export function forwardCtrlC(rl: { on(event: 'SIGINT', fn: () => void): unknown; close(): void }): void {
  rl.on('SIGINT', () => {
    rl.close();
    if (process.listenerCount('SIGINT') > 0) process.emit('SIGINT', 'SIGINT');
    else process.exit(0);
  });
}

/** Applied / Failed / Reasons tables, totals, file paths, a fresh dashboard, run time. */
export function printRunSummary(s: RunSummary): void {
  summaryPrinted = true;
  log.sectionHeader(`Applied (${s.applied.length})`);
  if (s.applied.length) {
    log.table(['#', ...s.appliedHeaders], s.applied.map((r, i) => [String(i + 1), ...r]));
  } else {
    log.info('None');
  }

  log.sectionHeader(`Failed (${s.failed.length})`);
  if (s.failed.length) {
    log.table(
      ['#', 'Company', 'Role', 'Reason'],
      s.failed.map((r, i) => [String(i + 1), r.company, r.role, r.reason]),
    );

    const totals = new Map<string, number>();
    for (const r of s.failed) totals.set(r.reason, (totals.get(r.reason) ?? 0) + 1);
    log.sectionHeader('Failure reasons');
    log.table(
      ['Reason', 'Count'],
      [...totals].sort((a, b) => b[1] - a[1]).map(([reason, n]) => [reason, String(n)]),
    );
  } else {
    log.info('None');
  }

  log.sectionHeader('Totals');
  for (const [label, value, colour] of s.counts) log.summaryLine(label, value, colour);
  log.divider();
  for (const f of s.files) log.info(f);
  try {
    log.info(`Dashboard: ${buildDashboard()}`);
  } catch (err) {
    log.warn(`Could not build dashboard: ${(err as Error).message}`);
  }
  log.finishRun();
  log.divider();
}
