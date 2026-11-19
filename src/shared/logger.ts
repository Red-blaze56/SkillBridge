/**
 * One logger for every bot (Wellfound, Instahyre, Indeed).
 *
 * Terminal: only what matters. The run header, one line per job (with a running
 * tally), its key facts, its result, warnings, and the summary at the end.
 * Log file: everything, including the step-by-step `step()` / `debug()` lines,
 * one file per run in output/autoapply/<site>/logs/ (the newest 10 are kept).
 * Set LOG_LEVEL=debug in .env to see the steps in the terminal too.
 *
 *   ✓ success   ⊘ skipped   ✗ failed   ! warning   → step (log file only)
 *
 * Uses ANSI escape codes, no external library.
 */
import fs from 'fs';
import path from 'path';

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const GRAY   = '\x1b[90m';
const PINK   = '\x1b[95m';

const KEEP_LOGS = 10;
const VERBOSE = /^debug$/i.test(process.env.LOG_LEVEL ?? '');

let logFilePath: string | null = null;
let runStarted = Date.now();
let jobStarted = Date.now();
const tally = { applied: 0, skipped: 0, failed: 0 };

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
const clock = (): string => new Date().toTimeString().slice(0, 8);

function toFile(text: string): void {
  if (!logFilePath) return;
  const body = stripAnsi(text).split('\n').map((l) => `[${clock()}] ${l}`).join('\n');
  try { fs.appendFileSync(logFilePath, body + '\n', 'utf8'); } catch { /* never let logging crash a run */ }
}

/** Terminal (styled) + log file (plain, timestamped). */
function emit(styled: string): void {
  console.log(styled);
  toFile(styled);
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

// ─── Run start / end ───────────────────────────────────────────

/** Starts a run: header line + a new log file in output/autoapply/<site>/logs/. */
export function startRun(title: string, logDir: string): void {
  runStarted = Date.now();
  Object.assign(tally, { applied: 0, skipped: 0, failed: 0 });
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  enableFileLog(path.join(logDir, `${stamp}.log`));         // local time, sorts by date
  const when = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  console.log();
  emit(`${PINK}${BOLD}━━ ${title}${RESET} ${GRAY}· ${when}${RESET}`);
  console.log(`   ${GRAY}log file: ${logFilePath}${RESET}`);
}

/** Total time + where the full log is. Called by printRunSummary. */
export function finishRun(): void {
  emit(`${GRAY}Done in ${duration(Date.now() - runStarted)}${RESET}`);
  if (logFilePath) console.log(`${GRAY}Full log (every step): ${logFilePath}${RESET}`);
}

/** A crash: short message in the terminal, full stack in the log file. */
export function fatal(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.log();
  emit(`${RED}${BOLD}✗ Stopped: ${e.message.split('\n')[0]}${RESET}`);
  toFile(e.stack ?? e.message);
  if (logFilePath) console.log(`${GRAY}Details: ${logFilePath}${RESET}`);
}

/** Mirrors every line (ANSI stripped) into `filePath`; keeps only the newest log files. */
export function enableFileLog(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  logFilePath = filePath;
  fs.writeFileSync(filePath, `=== run started ${new Date().toISOString()} ===\n`, 'utf8');
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort().reverse().slice(KEEP_LOGS);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
}

// ─── Levels ────────────────────────────────────────────────────

/** A mechanical step ("Clicking Apply…"). Log file only, unless LOG_LEVEL=debug. */
export function step(message: string): void {
  const line = `    ${GRAY}→ ${message}${RESET}`;
  if (VERBOSE) console.log(line);
  toFile(line);
}

/** Same as step(): detail that only matters when something goes wrong. */
export const debug = step;

/** A step shown live in the terminal too ("→ Clicking Apply…"), so you can follow the job as it runs. */
export function live(message: string): void {
  emit(`    ${CYAN}→${RESET} ${message}`);
}

export function success(message: string): void {
  emit(`    ${GREEN}✓ ${message}${RESET}`);
}

export function skip(message: string): void {
  emit(`    ${YELLOW}⊘ ${message}${RESET}`);
}

export function error(message: string): void {
  emit(`    ${RED}✗ ${message}${RESET}`);
}

/** Something odd but the run goes on (rate limit, retry, CSV locked). */
export function warn(message: string): void {
  emit(`    ${YELLOW}! ${message}${RESET}`);
}

/** A key fact about the current job (experience, role type, link). */
export function info(message: string): void {
  emit(`    ${DIM}${message}${RESET}`);
}

// ─── Jobs ──────────────────────────────────────────────────────

let jobInProgress: string | null = null;

/** The job being worked on right now ("[7/15] Company — Role"), or null between jobs. */
export function currentJob(): string | null {
  return jobInProgress;
}

/** "[3/15]  Company — Role                      ✓2 ⊘1 ✗0" */
export function jobHeader(current: number, total: number, label: string): void {
  jobStarted = Date.now();
  jobInProgress = `[${current}/${total}] ${label}`;
  const so = `${GREEN}✓${tally.applied}${RESET} ${YELLOW}⊘${tally.skipped}${RESET} ${RED}✗${tally.failed}${RESET}`;
  console.log();
  emit(`${GRAY}[${current}/${total}]${RESET} ${BOLD}${label}${RESET}  ${GRAY}·${RESET} ${so}`);
}

/** Counts the job's outcome for the tally shown in the next job header. */
export function jobDone(outcome: 'applied' | 'skipped' | 'failed'): void {
  tally[outcome]++;
  jobInProgress = null;
  toFile(`    (${outcome}, took ${duration(Date.now() - jobStarted)})`);
}

// ─── Layout ────────────────────────────────────────────────────

/** A numbered setup step: "1. Launching browser…" */
export function stage(n: number, message: string): void {
  console.log();
  emit(`${CYAN}${n}.${RESET} ${message}`);
}

export function sectionHeader(message: string): void {
  console.log();
  emit(`${BOLD}${message}${RESET}`);
  emit(`${GRAY}${'─'.repeat(message.length)}${RESET}`);
}

export function summaryLine(label: string, value: number, colour?: string): void {
  emit(`  ${label.padEnd(32, '.')} ${colour ? `${colour}${value}${RESET}` : value}`);
}

/** Prints rows as an aligned, boxed table. Long cells are truncated to keep it readable. */
export function table(headers: string[], rows: string[][], maxWidth = 40): void {
  const clip = (s: string) => (s.length > maxWidth ? s.slice(0, maxWidth - 1) + '…' : s);
  const body = rows.map((r) => r.map(clip));
  const widths = headers.map((h, i) => Math.max(h.length, ...body.map((r) => (r[i] ?? '').length)));

  const line = (l: string, m: string, r: string) =>
    `  ${GRAY}${l}${widths.map((w) => '─'.repeat(w + 2)).join(m)}${r}${RESET}`;
  const row = (cells: string[], style = '') =>
    `  ${GRAY}│${RESET}${cells.map((c, i) => ` ${style}${(c ?? '').padEnd(widths[i])}${RESET} `).join(`${GRAY}│${RESET}`)}${GRAY}│${RESET}`;

  emit(line('┌', '┬', '┐'));
  emit(row(headers, BOLD));
  emit(line('├', '┼', '┤'));
  for (const r of body) emit(row(r));
  emit(line('└', '┴', '┘'));
}

export function divider(): void {
  console.log();
  toFile('');
}

/** Plain text as-is (instructions, prompts). */
export function raw(message: string): void {
  emit(message);
}
