import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTOAPPLY_ROOT, OUTPUT_ROOT, readTable } from './csv.js';

export const DASHBOARD_HTML = path.join(OUTPUT_ROOT, 'dashboard.html');
const SCRAPER_DIR = path.join(OUTPUT_ROOT, 'scraper');
const JOBSCOUT_DIR = path.join(OUTPUT_ROOT, 'jobscout');

type Row = Record<string, string>;

/** One table page. `cols` are the columns shown; every other column opens in
 *  the row's detail panel. `filters` become dropdowns. `about` says what it is. */
interface Tab {
  id: string;
  group: 'Found jobs' | 'JobScout' | 'Bot results';
  label: string;
  about: string;
  file: string;
  rows: Row[];
  cols: string[];
  filters: string[];
}

const DESC_CHARS = 900; // the page only previews a description; the CSV keeps all of it

const NAMES: Record<string, string> = { linkedin: 'LinkedIn', zip_recruiter: 'ZipRecruiter', bdjobs: 'BDJobs', hellowork: 'HelloWork' };
const nice = (s: string) => NAMES[s] ?? s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function load(file: string): { header: string[]; rows: Row[] } {
  const { header, rows } = readTable(file);
  return {
    header,
    rows: rows
      .map((cells) => Object.fromEntries(header.map((h, i) => {
        const v = cells[i] ?? '';
        return [h, h === 'Description' && v.length > DESC_CHARS ? v.slice(0, DESC_CHARS) + ' …' : v];
      })))
      .reverse(), // newest first
  };
}

const pick = (header: string[], wanted: string[]) => wanted.filter((c) => header.includes(c));
const FILTERABLE = ['Status', 'Role Category', 'Role Type', 'Experience', 'Experience (yrs)', 'Work Mode',
  'Job Type', 'Fits Profile', 'Reason', 'reason', 'ats', 'source', 'applied', 'Site'];

function tab(id: string, group: Tab['group'], label: string, about: string, file: string, cols?: string[]): Tab | null {
  if (!fs.existsSync(file)) return null;
  const { header, rows } = load(file);
  return {
    id, group, label, about, file: path.relative(OUTPUT_ROOT, file).replace(/\\/g, '/'), rows,
    cols: cols ? pick(header, cols) : header.filter((h) => !['job_id', 'roles'].includes(h)),
    filters: pick(header, FILTERABLE),
  };
}

const listCsv = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).sort() : [];
const listDirs = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];

const ATS_ABOUT: Record<string, string> = {
  passed: 'Companies whose jobs were emailed to you.',
  failed_not_found: 'Dead or wrong board links — removed from companies.yaml.',
  failed_max_retries: 'Removed after several runs in a row with no matching jobs.',
};

/** One bot's passed.csv + failed.csv as one table with a Status column. */
function botTab(site: string): Tab | null {
  const dir = path.join(AUTOAPPLY_ROOT, site);
  const ok  = load(path.join(dir, 'passed.csv'));
  const bad = load(path.join(dir, 'failed.csv'));
  const rows = [
    ...ok.rows.map((r): Row => ({ Status: 'Applied', ...r })),
    ...bad.rows.map((r): Row => ({ Status: 'Failed', ...r })),
  ].sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
  if (!rows.length) return null;
  const header = ['Status', ...new Set([...ok.header, ...bad.header])];
  return {
    id: `bot-${site}`, group: 'Bot results', label: nice(site),
    about: `What pnpm start:${site} applied to, and what failed with the reason. Skipped jobs (already applied, too senior, company site) are only counted in the terminal.`,
    file: `autoapply/${site}/passed.csv + failed.csv`, rows,
    cols: pick(header, ['Date', 'Status', 'Company', 'Role', 'Experience', 'Reason', 'URL']),
    filters: pick(header, ['Status', 'Reason', 'Experience', 'Role Category', 'Role Type']),
  };
}

function collectTabs(): Tab[] {
  const tabs: (Tab | null)[] = [];

  // Scraper: one tab with every site's jobs together, then one tab per site.
  const sites = listCsv(SCRAPER_DIR).filter((f) => f.endsWith('_jobs.csv')).map((f) => {
    const site = f.replace('_jobs.csv', '');
    return tab(`scr-${site}`, 'Found jobs', nice(site), `Jobs pnpm start:scraper saved from ${nice(site)} that passed your filters.`,
      path.join(SCRAPER_DIR, f),
      ['Date', 'Score', 'Company', 'Role', 'Work Mode', 'Experience (yrs)', 'Location', 'Salary', 'Posted', 'Link']);
  }).filter((t): t is Tab => t !== null);
  if (sites.length) {
    tabs.push({
      id: 'scr-all', group: 'Found jobs', label: 'All sites',
      about: 'Every job the scraper saved, all sites together. Score is the AI fit score out of 10 — empty means not scored yet.',
      file: 'scraper/*_jobs.csv',
      rows: sites.flatMap((t) => t.rows.map((r): Row => ({ ...r, Site: nice(r.Site || t.id.slice(4)) })))
        .sort((a, b) => (b.Date || '').localeCompare(a.Date || '')),
      cols: ['Date', 'Score', 'Site', 'Company', 'Role', 'Work Mode', 'Experience (yrs)', 'Location', 'Also On', 'Link'],
      filters: ['Site', 'Work Mode', 'Role Category', 'Experience (yrs)', 'Job Type'],
    });
  }
  tabs.push(...sites.filter((t) => t.rows.length));

  tabs.push(tab('scout', 'JobScout', 'Emailed matches', 'Jobs from company boards that JobScout scored 7+ and emailed you.',
    path.join(JOBSCOUT_DIR, 'jobs.csv'),
    ['Date', 'Score', 'Company', 'Role', 'Role Category', 'Experience (yrs)', 'Location', 'Link']));
  tabs.push(tab('tracker', 'JobScout', 'Every scored job', 'Every job JobScout has scored, good or bad.',
    path.join(JOBSCOUT_DIR, 'tracker.csv'),
    ['first_seen', 'score', 'company', 'title', 'location', 'applied', 'url']));
  for (const f of listCsv(path.join(JOBSCOUT_DIR, 'ats_matcher'))) {
    const name = f.replace('.csv', '');
    tabs.push(tab(`ats-${name}`, 'JobScout', `Companies: ${nice(name)}`,
      ATS_ABOUT[name] ?? 'Company board check results.', path.join(JOBSCOUT_DIR, 'ats_matcher', f)));
  }

  for (const site of listDirs(AUTOAPPLY_ROOT)) tabs.push(botTab(site));
  return tabs.filter((t): t is Tab => t !== null);
}

/** Rebuilds output/dashboard.html from every CSV in output/. Returns its path. */
export function buildDashboard(): string {
  const tabs = collectTabs();
  const data = {
    updated: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    today: new Date().toLocaleDateString('en-CA'), // local YYYY-MM-DD
    tabs,
  };
  // Escape "<" so scraped text can never close the <script> tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.writeFileSync(DASHBOARD_HTML, PAGE.replace('__DATA__', () => json));
  return DASHBOARD_HTML;
}

// String.raw: the page script below keeps its backslashes (regexes) as written.
const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Dashboard</title>
<style>
  :root {
    --bg: #0b0b0f; --panel: #131218; --card: #18161e; --raise: #201d27; --line: #2a2731;
    --text: #f6eef3; --muted: #a59ba8; --faint: #6f6674;
    --pink: #f0388f; --pink-hi: #ff6aac; --pink-soft: rgba(240,56,143,.14); --pink-line: rgba(240,56,143,.45);
    /* section accents (validated: CVD-safe on this black) */
    --c-scout: #f0388f; --c-scraper: #0aa5c4; --c-auto: #8b6cf0; --c-auto-hi: #a68cff;
    --good: #3fb950; --bad: #f85149;
    --remote: #0aa5c4; --hybrid: #8b6cf0; --onsite: #c08400;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--pink-hi); }
  button { font: inherit; }
  :focus-visible { outline: 2px solid var(--pink); outline-offset: 2px; }
  .app { display: grid; grid-template-columns: 236px 1fr; min-height: 100vh; }

  /* ── sidebar ── */
  nav { background: var(--panel); border-right: 1px solid var(--line); padding: 20px 12px;
        position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 18px; }
  .logo { width: 30px; height: 30px; border-radius: 9px; background: var(--pink);
          box-shadow: 0 0 22px rgba(240,56,143,.55); }
  .brand b { font-size: 16px; }
  .brand small { display: block; color: var(--muted); font-size: 11px; }
  .group { color: var(--faint); font-size: 11px; font-weight: 700; letter-spacing: .1em;
           text-transform: uppercase; padding: 14px 10px 6px; display: flex; align-items: center; gap: 8px; }
  .group i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .nav-btn { display: flex; justify-content: space-between; align-items: center; width: 100%;
             background: none; border: 0; color: var(--muted); text-align: left;
             padding: 8px 10px; border-radius: 8px; cursor: pointer; }
  .nav-btn:hover { background: var(--raise); color: var(--text); }
  .nav-btn.active { background: var(--pink-soft); color: var(--text); box-shadow: inset 2px 0 0 var(--pink); }
  .nav-btn .n { font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }
  .nav-btn.hot .n { background: var(--pink); color: #0b0b0f; font-weight: 800; border-radius: 999px; padding: 0 7px; }

  /* ── page ── */
  main { padding: 28px 32px 60px; min-width: 0; max-width: 1280px; }
  h1 { font-size: 24px; margin: 0; }
  h1 em { font-style: normal; color: var(--pink); }
  .sub { color: var(--muted); font-size: 13px; margin: 6px 0 20px; max-width: 760px; }
  .sub code { background: var(--raise); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 18px; }
  .card h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
             margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--line);
             display: flex; justify-content: space-between; gap: 10px; }
  .card h2 small { text-transform: none; letter-spacing: 0; color: var(--faint); font-weight: 400; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .grid2 .card { margin-bottom: 0; }

  /* ── stat tiles ── */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px;
          border-top: 3px solid var(--accent, var(--pink)); text-align: left; color: inherit; }
  button.tile { cursor: pointer; } button.tile:hover { background: var(--raise); }
  .tile .n { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .tile .l { color: var(--text); font-size: 13px; }
  .tile .h { color: var(--faint); font-size: 12px; margin-top: 2px; }

  /* ── bar lists (horizontal) ── */
  .bars { padding: 10px 16px 14px; }
  .bar { display: grid; grid-template-columns: 170px 1fr 44px; align-items: center; gap: 10px; padding: 5px 0; }
  .bar .track { height: 12px; }
  .bar .fill { height: 100%; border-radius: 0 4px 4px 0; min-width: 2px; }
  .bar .v { text-align: right; font-variant-numeric: tabular-nums; }
  .bar .k { color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar.link { cursor: pointer; } .bar.link:hover .k { color: var(--text); }

  /* ── per-day column chart ── */
  .chart { position: relative; padding: 18px 16px 12px; }
  .plot { display: flex; align-items: flex-end; gap: 2px; height: 160px; border-bottom: 1px solid var(--line); }
  .colm { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
  .colm .b { position: relative; width: 70%; max-width: 26px; background: var(--c-auto); border-radius: 4px 4px 0 0; }
  .colm:hover .b { background: var(--c-auto-hi); }
  .colm .lbl { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 3px;
               font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .xl { display: flex; gap: 2px; margin-top: 6px; }
  .xl span { flex: 1; text-align: center; font-size: 11px; color: var(--faint); white-space: nowrap; }
  .tip { position: absolute; pointer-events: none; background: var(--raise); border: 1px solid var(--line);
         border-radius: 8px; padding: 6px 10px; font-size: 12px; white-space: nowrap; display: none; z-index: 3;
         transform: translate(-50%, -100%); }
  .tip b { display: block; }

  /* ── controls ── */
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: center; }
  select, input[type=search] { background: var(--card); color: var(--text); border: 1px solid var(--line);
    border-radius: 9px; padding: 8px 10px; font: inherit; }
  input[type=search] { flex: 1; min-width: 200px; }
  select:focus, input:focus { outline: none; border-color: var(--pink); }
  .range { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px;
           background: var(--card); border: 1px solid var(--line); border-radius: 9px; padding: 6px 10px; }
  .range input { accent-color: var(--pink); }
  .count { color: var(--muted); font-size: 13px; margin: 0 0 8px; }
  .seg { display: inline-flex; flex-wrap: wrap; background: var(--card); border: 1px solid var(--line);
         border-radius: 11px; padding: 3px; margin-bottom: 12px; gap: 2px; }
  .seg button { background: none; border: 0; color: var(--muted); padding: 7px 14px; border-radius: 8px; cursor: pointer; }
  .seg button:hover { color: var(--text); }
  .seg button.on { background: var(--pink-soft); color: var(--text); box-shadow: inset 0 0 0 1px var(--pink-line); }
  .seg b { font-variant-numeric: tabular-nums; margin-left: 4px; }

  /* ── job cards (Apply next) ── */
  .jobs { padding: 0; }
  .job { display: grid; grid-template-columns: 54px 1fr auto; gap: 6px 14px; padding: 14px 16px;
         border-bottom: 1px solid var(--line); }
  .job:last-child { border-bottom: 0; }
  .job.done { opacity: .55; }
  .job h3 { margin: 0; font-size: 15px; line-height: 1.35; }
  .job .meta { color: var(--muted); font-size: 13px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
  .why { color: var(--muted); font-size: 13px; margin-top: 7px; border-left: 2px solid var(--line); padding-left: 9px; }
  .acts { display: flex; gap: 6px; align-items: flex-start; flex-wrap: wrap; justify-content: flex-end; }
  .btn { background: var(--raise); border: 1px solid var(--line); color: var(--text); border-radius: 8px;
         padding: 6px 11px; font-size: 13px; cursor: pointer; text-decoration: none; white-space: nowrap; line-height: 1.4; }
  .btn:hover { border-color: var(--muted); }
  .btn.primary { background: var(--pink); color: #0b0b0f; border-color: var(--pink); font-weight: 700; }
  .btn.primary:hover { background: var(--pink-hi); }
  .btn.yes:hover { border-color: var(--good); color: var(--good); }
  .btn.no:hover { border-color: var(--bad); color: var(--bad); }
  .btn.link { background: none; border-color: transparent; color: var(--muted); padding-left: 4px; padding-right: 4px; }
  .btn.link:hover { color: var(--text); }
  .state { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
  .state.ok { color: var(--good); border: 1px solid var(--good); }
  .state.skip { color: var(--muted); border: 1px solid var(--line); }
  .more { display: block; width: 100%; padding: 12px; background: none; border: 0; border-top: 1px solid var(--line);
          color: var(--pink-hi); cursor: pointer; }
  .jd { grid-column: 2 / -1; background: #100f14; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-top: 6px; }

  /* ── shared bits ── */
  .pill { display: inline-block; min-width: 40px; text-align: center; padding: 2px 8px; border-radius: 999px;
          font-weight: 800; font-size: 12px; font-variant-numeric: tabular-nums; }
  .pill.big { min-width: 50px; font-size: 16px; padding: 7px 0; border-radius: 11px; align-self: start; }
  .pill.big small { display: block; font-size: 10px; font-weight: 600; opacity: .8; }
  .s-high { background: var(--pink); color: #0b0b0f; }
  .s-good { background: #9c2a62; color: #fff; }
  .s-fair { background: #4b2338; color: #f6c9de; }
  .s-low  { background: var(--raise); color: var(--muted); }
  .chip { display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 12px; border: 1px solid var(--line); color: var(--muted); }
  .open-btn { display: inline-block; background: var(--pink); color: #0b0b0f; font-weight: 700; font-size: 12px;
              text-decoration: none; padding: 5px 11px; border-radius: 7px; }
  .open-btn:hover { background: var(--pink-hi); }
  .ok { color: var(--good); font-weight: 700; } .bad { color: var(--bad); }
  .wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; vertical-align: top; }
  th { color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
       cursor: pointer; user-select: none; position: sticky; top: 0; background: var(--card); }
  th:hover { color: var(--text); }
  th .arrow { color: var(--pink); }
  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: var(--raise); }
  tr.open td { background: var(--raise); }
  td.wide { white-space: normal; min-width: 200px; max-width: 360px; }
  td.role { font-weight: 600; }
  .detail td { white-space: normal; background: #100f14; cursor: default; }
  dl.kv { display: grid; grid-template-columns: 150px 1fr; gap: 6px 16px; margin: 4px 0; max-width: 1000px; }
  dl.kv dt { color: var(--faint); font-size: 12px; }
  dl.kv dd { margin: 0; word-break: break-word; white-space: pre-line; }
  .empty { padding: 36px; text-align: center; color: var(--muted); }
  .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; padding: 14px 16px; }
  .steps div { color: var(--muted); font-size: 13px; }
  .steps b { color: var(--text); display: block; }
  .steps code { color: var(--pink-hi); }

  @media (max-width: 860px) {
    .app { grid-template-columns: 1fr; }
    nav { position: static; height: auto; display: flex; gap: 4px; overflow-x: auto; padding: 10px 16px; border-right: 0; border-bottom: 1px solid var(--line); }
    .brand, .group { display: none; }
    .nav-btn { white-space: nowrap; width: auto; gap: 6px; }
    main { padding: 18px 16px 40px; }
    .grid2 { grid-template-columns: 1fr; }
    .job { grid-template-columns: 46px 1fr; }
    .acts { grid-column: 1 / -1; justify-content: flex-start; }
    .jd { grid-column: 1 / -1; }
    dl.kv { grid-template-columns: 1fr; } dl.kv dt { margin-top: 6px; }
    .bar { grid-template-columns: 110px 1fr 36px; }
  }
</style>
</head>
<body>
<div class="app">
  <nav id="nav"></nav>
  <main id="main"></main>
</div>
<script type="application/json" id="data">__DATA__</script>
<script>
var DATA = JSON.parse(document.getElementById('data').textContent);
var GROUPS = ['Start here', 'Found jobs', 'JobScout', 'Bot results'];
var GROUP_COLOR = { 'Start here': 'var(--pink)', 'JobScout': 'var(--c-scout)', 'Found jobs': 'var(--c-scraper)', 'Bot results': 'var(--c-auto)' };
var LINK_COLS = ['Link', 'URL', 'url', 'Apply Link', 'Company Page'];
var SCORE_COLS = ['Score', 'score'];
var WIDE = ['Role', 'title', 'Reason', 'reason', 'Location', 'location', 'roles', 'AI Reason'];
var PAGE_SIZE = 40;
var state = { tab: 'queue', q: '', f: {}, min: 0, sort: null, dir: -1, open: null,
              qs: 'todo', qsrc: '', qmode: '', qscore: 'fit', qsort: 'score', qshow: PAGE_SIZE };
try { state.tab = localStorage.getItem('dash-tab') || 'queue'; } catch (e) {}

// ── your marks (Applied / Not interested), kept in this browser ──
var MARKS = {};
try { MARKS = JSON.parse(localStorage.getItem('dash-marks') || '{}'); } catch (e) {}
function saveMarks() { try { localStorage.setItem('dash-marks', JSON.stringify(MARKS)); } catch (e) {} }

function ymd(d) { function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
function tabById(id) { for (var i = 0; i < DATA.tabs.length; i++) if (DATA.tabs[i].id === id) return DATA.tabs[i]; return null; }
function tabsIn(group) { return DATA.tabs.filter(function (t) { return t.group === group; }); }
function scoreCol(t) { for (var i = 0; i < SCORE_COLS.length; i++) if (t.cols.indexOf(SCORE_COLS[i]) >= 0) return SCORE_COLS[i]; return null; }
// Same company + role = same job, like the scraper's dedup ("Acme Pvt Ltd" == "acme").
function norm(s) { return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
  .replace(/\b(pvt|private|ltd|limited|llp|inc|co|corp|corporation)\b/g, ' ').replace(/[^a-z0-9]/g, ''); }
function fp(company, role) { return norm(company) + '|' + norm(role); }
function go(id) { state.tab = id; state.q = ''; state.f = {}; state.min = 0; state.sort = null; state.open = null; state.qshow = PAGE_SIZE;
  try { localStorage.setItem('dash-tab', id); } catch (e) {} render(); window.scrollTo(0, 0); }

function scorePill(v, big) {
  var n = num(v);
  var p = el('span', n === null ? '—' : n.toFixed(1), 'pill ' + (big ? 'big ' : '') +
    (n === null ? 's-low' : n >= 8.5 ? 's-high' : n >= 7.5 ? 's-good' : n >= 7 ? 's-fair' : 's-low'));
  p.title = n === null ? 'Not scored yet' : n >= 8.5 ? 'Strong fit' : n >= 7.5 ? 'Good fit' : n >= 7 ? 'Fair fit' : 'Below the bar';
  if (big) p.append(el('small', n === null ? 'new' : 'of 10'));
  return p;
}
function modeChip(v) {
  var c = { 'Remote': 'var(--remote)', 'Hybrid': 'var(--hybrid)', 'On-site': 'var(--onsite)' }[v] || 'var(--faint)';
  var s = el('span', v || '—', 'chip'); s.style.color = c; s.style.borderColor = c; return s;
}
function linkBtn(v) {
  if (!v || v.indexOf('http') !== 0) return document.createTextNode('');
  var a = el('a', 'Open ↗', 'open-btn'); a.href = v; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.onclick = function (e) { e.stopPropagation(); }; return a;
}
function statusCell(td, v) {
  td.textContent = v === 'Applied' ? '✓ Applied' : v === 'Failed' ? '✗ Failed' : v;
  td.className = v === 'Applied' ? 'ok' : v === 'Failed' ? 'bad' : '';
}
function cell(col, v) {
  var td = el('td');
  if (SCORE_COLS.indexOf(col) >= 0) td.append(scorePill(v));
  else if (LINK_COLS.indexOf(col) >= 0) td.append(linkBtn(v));
  else if (col === 'Work Mode') td.append(modeChip(v));
  else if (col === 'Status') statusCell(td, v);
  else if (col === 'Fits Profile' || col === 'applied') { td.textContent = v; td.className = /^(yes|true)$/i.test(v) ? 'ok' : ''; }
  else { td.textContent = v; if (WIDE.indexOf(col) >= 0) td.className = 'wide'; if (col === 'Role' || col === 'title') td.classList.add('role'); if (col === 'Reason') td.classList.add('bad'); }
  return td;
}
function details(r, skip) {
  var dl = el('dl', null, 'kv');
  Object.keys(r).forEach(function (k) {
    if (!r[k] || (skip && skip.indexOf(k) >= 0)) return;
    dl.append(el('dt', k.replace(/_/g, ' ')));
    var dd = el('dd');
    if (r[k].indexOf('http') === 0) { var a = el('a', r[k]); a.href = r[k]; a.target = '_blank'; a.rel = 'noopener noreferrer'; dd.append(a); }
    else dd.textContent = r[k];
    dl.append(dd);
  });
  return dl;
}

// ── the Apply-next queue: JobScout matches + scraper jobs, one entry per job ──
var BOT_DONE = {};   // link or company|role → bot that applied
tabsIn('Bot results').forEach(function (t) {
  t.rows.forEach(function (r) { if (r.Status === 'Applied') { BOT_DONE[fp(r.Company, r.Role)] = t.label; if (r.URL) BOT_DONE[r.URL] = t.label; } });
});
var TRACKED = {};
(tabById('tracker') || { rows: [] }).rows.forEach(function (r) { if (/^(yes|true)$/i.test(r.applied || '') && r.url) TRACKED[r.url] = true; });

var QUEUE = (function () {
  var byKey = {}, out = [];
  function add(r, source) {
    var link = r.Link || r.url || '', f = fp(r.Company, r.Role), j = byKey[link] || byKey[f];
    if (j) {
      if (j.sources.indexOf(source) < 0) j.sources.push(source);
      if (num(r.Score) !== null && (j.score === null || num(r.Score) > j.score)) j.score = num(r.Score);
      return;
    }
    j = { key: link || f, fp: f, link: link, apply: r['Apply Link'] || '', company: r.Company || '', role: r.Role || '',
          score: num(r.Score), date: r.Date || '', posted: r.Posted || '', mode: r['Work Mode'] || '',
          exp: r['Experience (yrs)'] || '', loc: r.Location || '', why: r['AI Reason'] || '', salary: r.Salary || '',
          sources: [source], row: r };
    if (link) byKey[link] = j; byKey[f] = j; out.push(j);
  }
  (tabById('scout') || { rows: [] }).rows.forEach(function (r) { add(r, 'JobScout'); });
  (tabById('scr-all') || { rows: [] }).rows.forEach(function (r) { add(r, r.Site || 'Scraper'); });
  return out;
})();

function statusOf(j) {
  var m = MARKS[j.key]; if (m) return m.s;
  if (BOT_DONE[j.link] || BOT_DONE[j.fp] || TRACKED[j.link]) return 'applied';
  return 'todo';
}
function byWho(j) { var m = MARKS[j.key]; if (m) return 'you, ' + m.t; var b = BOT_DONE[j.link] || BOT_DONE[j.fp]; return b ? b + ' bot' : 'JobScout tracker'; }
function passesScore(j) {
  var s = state.qscore;
  if (s === 'all') return true;
  if (s === 'fit') return j.score === null || j.score >= 7;
  return j.score !== null && j.score >= parseFloat(s);
}
// Same set as the default "To apply" view: score 7+ or not scored yet.
function todoCount() { return QUEUE.filter(function (j) { return statusOf(j) === 'todo' && (j.score === null || j.score >= 7); }).length; }

function mark(j, s) {
  if (s) MARKS[j.key] = { s: s, t: ymd(new Date()) }; else delete MARKS[j.key];
  saveMarks(); render();
}

function jobCard(j) {
  var st = statusOf(j), card = el('div', null, 'job' + (st === 'todo' ? '' : ' done'));
  card.append(scorePill(j.score, true));

  var mid = el('div');
  var h = el('h3'); var a = el('a', j.role || 'Untitled role'); a.href = j.link || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.style.color = 'inherit'; a.style.textDecoration = 'none'; h.append(a); mid.append(h);
  mid.append(el('div', [j.company, j.loc].filter(Boolean).join(' · '), 'meta'));
  var chips = el('div', null, 'chips');
  if (j.mode) chips.append(modeChip(j.mode));
  if (j.exp && j.exp !== 'Not mentioned') chips.append(el('span', /yr/i.test(j.exp) ? j.exp : j.exp + ' yrs', 'chip'));
  if (j.salary) chips.append(el('span', j.salary, 'chip'));
  chips.append(el('span', 'Found ' + (j.posted || j.date || '—'), 'chip'));
  j.sources.forEach(function (s) { chips.append(el('span', s, 'chip')); });
  mid.append(chips);
  if (j.why) mid.append(el('div', j.why, 'why'));
  card.append(mid);

  var acts = el('div', null, 'acts');
  if (st === 'todo') {
    if (j.link) { var o = el('a', 'Open job ↗', 'btn primary'); o.href = j.link; o.target = '_blank'; o.rel = 'noopener noreferrer'; acts.append(o); }
    if (j.apply && j.apply !== j.link) { var c = el('a', 'Company site ↗', 'btn'); c.href = j.apply; c.target = '_blank'; c.rel = 'noopener noreferrer'; acts.append(c); }
    var y = el('button', '✓ Applied', 'btn yes'); y.title = 'I applied — move it to Applied'; y.onclick = function () { mark(j, 'applied'); };
    var n = el('button', '✕', 'btn no'); n.title = 'Not interested — hide it'; n.onclick = function () { mark(j, 'skip'); };
    acts.append(y, n);
  } else {
    acts.append(el('span', st === 'applied' ? '✓ Applied by ' + byWho(j) : 'Not interested', 'state ' + (st === 'applied' ? 'ok' : 'skip')));
    if (MARKS[j.key]) { var u = el('button', 'Undo', 'btn link'); u.onclick = function () { mark(j, null); }; acts.append(u); }
  }
  var more = el('button', state.open === j.key ? 'Hide details' : 'Details', 'btn link');
  more.onclick = function () { state.open = state.open === j.key ? null : j.key; render(); };
  acts.append(more);
  card.append(acts);

  if (state.open === j.key) {
    var jd = el('div', null, 'jd'); jd.append(details(j.row, ['Company', 'Role', 'Score', 'Link'])); card.append(jd);
  }
  return card;
}

function queuePage(main) {
  var h = el('h1'); h.append(document.createTextNode('Apply '), el('em', 'next')); main.append(h);
  main.append(el('div', 'The best jobs JobScout and the scraper found, in one list. Open a job, apply on the site, then press ✓ Applied — this page remembers it (in this browser). Jobs your bots already applied to move to Applied by themselves.', 'sub'));

  var counts = { todo: 0, applied: 0, skip: 0 };
  var pool = QUEUE.filter(passesScore).filter(function (j) {
    return (!state.qsrc || j.sources.indexOf(state.qsrc) >= 0) && (!state.qmode || j.mode === state.qmode);
  });
  var needle = state.q.trim().toLowerCase();
  if (needle) pool = pool.filter(function (j) { return (j.company + ' ' + j.role + ' ' + j.loc + ' ' + (j.row.Skills || '')).toLowerCase().indexOf(needle) >= 0; });
  pool.forEach(function (j) { counts[statusOf(j)]++; });

  var seg = el('div', null, 'seg');
  [['todo', 'To apply'], ['applied', 'Applied'], ['skip', 'Not interested']].forEach(function (s) {
    var b = el('button', s[1], state.qs === s[0] ? 'on' : ''); b.append(el('b', String(counts[s[0]])));
    b.onclick = function () { state.qs = s[0]; state.qshow = PAGE_SIZE; state.open = null; render(); }; seg.append(b);
  });
  main.append(seg);

  var bar = el('div', null, 'toolbar');
  var q = el('input'); q.type = 'search'; q.placeholder = 'Search company, role, skill…'; q.value = state.q;
  q.oninput = function () { state.q = q.value; state.qshow = PAGE_SIZE; renderKeepFocus(); }; bar.append(q);
  function sel(label, key, opts) {
    var s = el('select'); s.title = label;
    opts.forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; s.append(op); });
    s.value = state[key]; s.onchange = function () { state[key] = s.value; state.qshow = PAGE_SIZE; render(); }; bar.append(s);
  }
  var srcs = {}; QUEUE.forEach(function (j) { j.sources.forEach(function (s) { srcs[s] = 1; }); });
  sel('Where it was found', 'qsrc', [['', 'All sources']].concat(Object.keys(srcs).sort().map(function (s) { return [s, s]; })));
  sel('Work mode', 'qmode', [['', 'Any work mode'], ['Remote', 'Remote'], ['Hybrid', 'Hybrid'], ['On-site', 'On-site']]);
  sel('Fit score', 'qscore', [['fit', 'Score 7+ and not yet scored'], ['7', 'Score 7+'], ['7.7', 'Score 7.7+'], ['8.5', 'Score 8.5+ (strong)'], ['all', 'Every score']]);
  sel('Order', 'qsort', [['score', 'Best score first'], ['new', 'Newest first']]);
  main.append(bar);

  var list = pool.filter(function (j) { return statusOf(j) === state.qs; });
  list.sort(state.qsort === 'new'
    ? function (a, b) { return (b.posted || b.date).localeCompare(a.posted || a.date); }
    : function (a, b) { return ((b.score === null ? 6.9 : b.score) - (a.score === null ? 6.9 : a.score)) || (b.date || '').localeCompare(a.date || ''); });

  var card = el('div', null, 'card jobs');
  if (!list.length) {
    card.append(el('div', state.qs === 'todo'
      ? (QUEUE.length ? 'Nothing left to apply to with these filters. 🎉' : 'No jobs yet — run pnpm start:scraper or pnpm start:jobscout first.')
      : 'Nothing here yet.', 'empty'));
  }
  list.slice(0, state.qshow).forEach(function (j) { card.append(jobCard(j)); });
  if (list.length > state.qshow) {
    var m = el('button', 'Show ' + Math.min(PAGE_SIZE, list.length - state.qshow) + ' more (' + (list.length - state.qshow) + ' left)', 'more');
    m.onclick = function () { state.qshow += PAGE_SIZE; render(); }; card.append(m);
  }
  main.append(card);
}

// Re-render while typing in search without losing the cursor.
function renderKeepFocus() {
  var pos = document.activeElement && document.activeElement.selectionStart;
  render();
  var s = document.querySelector('main input[type=search]');
  if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) {} }
}

// ── Overview ──
function tile(n, label, hint, accent, to) {
  var t = el(to ? 'button' : 'div', null, 'tile'); t.style.setProperty('--accent', accent);
  t.append(el('div', String(n), 'n'), el('div', label, 'l')); if (hint) t.append(el('div', hint, 'h'));
  if (to) t.onclick = function () { if (typeof to === 'function') to(); else go(to); };
  return t;
}

function perDayChart(host, days) {
  // Applications per day, last N days: every bot's Applied rows + jobs you marked Applied.
  var counts = {}, who = {};
  function bump(d, src) { if (!d) return; counts[d] = (counts[d] || 0) + 1; who[d] = who[d] || {}; who[d][src] = (who[d][src] || 0) + 1; }
  tabsIn('Bot results').forEach(function (t) { t.rows.forEach(function (r) { if (r.Status === 'Applied') bump(r.Date, t.label + ' bot'); }); });
  Object.keys(MARKS).forEach(function (k) { if (MARKS[k].s === 'applied') bump(MARKS[k].t, 'You'); });

  var list = [], end = new Date(DATA.today + 'T00:00:00');
  for (var i = days - 1; i >= 0; i--) { var d = new Date(end); d.setDate(end.getDate() - i); list.push(ymd(d)); }
  var max = Math.max.apply(null, list.map(function (d) { return counts[d] || 0; }).concat([1]));
  var total = list.reduce(function (a, d) { return a + (counts[d] || 0); }, 0);
  var peak = list.reduce(function (a, d) { return (counts[d] || 0) > (counts[a] || 0) ? d : a; }, list[0]);

  var wrap = el('div', null, 'chart'), plot = el('div', null, 'plot'), xl = el('div', null, 'xl'), tip = el('div', null, 'tip');
  list.forEach(function (d, i) {
    var c = counts[d] || 0, col = el('div', null, 'colm');
    var b = el('div', null, 'b'); b.style.height = (c / max * 88) + '%'; if (c) b.style.minHeight = '3px'; col.append(b);
    if (c && d === peak) b.append(el('div', String(c), 'lbl'));        // label only the peak
    col.onmouseenter = function () {
      var lines = Object.keys(who[d] || {}).map(function (s) { return s + ': ' + who[d][s]; });
      tip.replaceChildren(el('b', new Date(d + 'T00:00:00').toDateString().slice(0, 10) + ' — ' + c + ' applied'));
      lines.forEach(function (l) { tip.append(el('div', l)); });
      var r = col.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      tip.style.left = (r.left - w.left + r.width / 2) + 'px'; tip.style.top = (b.getBoundingClientRect().top - w.top - 6) + 'px';
      tip.style.display = 'block';
    };
    col.onmouseleave = function () { tip.style.display = 'none'; };
    plot.append(col);
    xl.append(el('span', i % 3 === 0 || i === list.length - 1 ? d.slice(8) + '/' + d.slice(5, 7) : ''));
  });
  wrap.append(plot, xl, tip);
  host.append(wrap);
  return total;
}

function barList(host, items, color) {
  var max = Math.max.apply(null, items.map(function (x) { return x.v; }).concat([1]));
  var bars = el('div', null, 'bars');
  items.forEach(function (x) {
    var b = el('div', null, 'bar' + (x.to ? ' link' : '')); b.title = x.k + ': ' + x.v;
    var tr = el('div', null, 'track'), fill = el('div', null, 'fill');
    fill.style.width = (x.v / max * 100) + '%'; fill.style.background = x.color || color; tr.append(fill);
    b.append(el('div', x.k, 'k'), tr, el('div', String(x.v), 'v'));
    if (x.to) b.onclick = function () { go(x.to); };
    bars.append(b);
  });
  if (!items.length) bars.append(el('div', 'Nothing yet.', 'empty'));
  host.append(bars);
}

function overview(main) {
  var h = el('h1'); h.append(document.createTextNode('Your job '), el('em', 'search')); main.append(h);
  main.append(el('div', 'Everything the tools in this repo produced, in one place. Updated ' + DATA.updated + ' — rebuilt after every run, or with pnpm dashboard.', 'sub'));

  var bots = tabsIn('Bot results');
  var botApplied = 0, botFailed = 0;
  bots.forEach(function (t) { t.rows.forEach(function (r) { if (r.Status === 'Applied') botApplied++; else botFailed++; }); });
  var youApplied = Object.keys(MARKS).filter(function (k) { return MARKS[k].s === 'applied'; }).length;
  var scr = tabById('scr-all'), scored = scr ? scr.rows.filter(function (r) { return num(r.Score) !== null; }).length : 0;
  var scout = tabById('scout');

  var tiles = el('div', null, 'tiles');
  tiles.append(
    tile(todoCount(), 'Waiting for you', 'score 7+ or not scored yet, not applied →', 'var(--pink)', function () { state.qs = 'todo'; state.qscore = 'fit'; go('queue'); }),
    tile(botApplied + youApplied, 'Applications sent', botApplied + ' by bots · ' + youApplied + ' marked by you', 'var(--good)'),
    tile(botFailed, 'Bot failures', 'see the reasons below', 'var(--bad)'),
    tile(scr ? scr.rows.length : 0, 'Jobs the scraper found', scored + ' AI-scored so far', 'var(--c-scraper)', scr ? 'scr-all' : null),
    tile(scout ? scout.rows.length : 0, 'JobScout matches emailed', 'from company boards', 'var(--c-scout)', scout ? 'scout' : null));
  main.append(tiles);

  var chartCard = el('div', null, 'card'), ch = el('h2', 'Applications per day'), small = el('small');
  ch.append(small); chartCard.append(ch);
  var total = perDayChart(chartCard, 21);
  small.textContent = 'last 21 days · ' + total + ' total · hover a day for the breakdown';
  main.append(chartCard);

  var g = el('div', null, 'grid2');
  var c1 = el('div', null, 'card'); c1.append(el('h2', 'Applied by each bot'));
  barList(c1, bots.map(function (t) {
    return { k: t.label, v: t.rows.filter(function (r) { return r.Status === 'Applied'; }).length, to: t.id };
  }).sort(function (a, b) { return b.v - a.v; }), 'var(--c-auto)');
  var c2 = el('div', null, 'card'); c2.append(el('h2', 'Why bot applications failed'));
  var reasons = {};
  bots.forEach(function (t) { t.rows.forEach(function (r) { if (r.Status === 'Failed') { var k = r.Reason || 'No reason'; reasons[k] = (reasons[k] || 0) + 1; } }); });
  barList(c2, Object.keys(reasons).map(function (k) { return { k: k, v: reasons[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8), 'var(--faint)');
  g.append(c1, c2); g.style.marginBottom = '18px'; main.append(g);

  var c3 = el('div', null, 'card'); c3.append(el('h2', 'Jobs found per site'));
  barList(c3, tabsIn('Found jobs').filter(function (t) { return t.id !== 'scr-all'; }).map(function (t) {
    return { k: t.label, v: t.rows.length, to: t.id };
  }).sort(function (a, b) { return b.v - a.v; }), 'var(--c-scraper)');
  main.append(c3);

  var c4 = el('div', null, 'card'); c4.append(el('h2', 'Daily routine'));
  var steps = el('div', null, 'steps');
  [['1 · Find', 'pnpm start:scraper and pnpm start:jobscout collect and score jobs.'],
   ['2 · Auto-apply', 'pnpm start:instahyre, start:naukri, start:indeed, start:glassdoor, start:wellfound apply for you.'],
   ['3 · Apply by hand', 'Go through Apply next: open each job, apply, press ✓ Applied.'],
   ['4 · Check failures', 'Bot results → filter Status = Failed to see what needs a manual apply.']].forEach(function (s) {
    var d = el('div'); d.append(el('b', s[0]), document.createTextNode(s[1])); steps.append(d);
  });
  c4.append(steps); main.append(c4);
}

// ── generic table page ──
function table(host, t) {
  var sc = scoreCol(t);
  if (sc && !state.sort) { state.sort = sc; state.dir = -1; } // best score first
  var bar = el('div', null, 'toolbar');
  var q = el('input'); q.type = 'search'; q.placeholder = 'Search company, role, location…'; q.value = state.q;
  q.oninput = function () { state.q = q.value; draw(); }; bar.append(q);
  (t.filters || []).forEach(function (col) {
    var vals = {}; t.rows.forEach(function (r) { if (r[col]) vals[r[col]] = (vals[r[col]] || 0) + 1; });
    var keys = Object.keys(vals).sort(); if (keys.length < 2 || keys.length > 40) return;
    var s = el('select'); s.append(el('option', 'All ' + col.toLowerCase())); s.firstChild.value = '';
    keys.forEach(function (k) { var o = el('option', k + ' (' + vals[k] + ')'); o.value = k; s.append(o); });
    s.value = state.f[col] || ''; s.onchange = function () { state.f[col] = s.value; draw(); }; bar.append(s);
  });
  if (sc) {
    var r = el('label', null, 'range'); var lab = el('span', 'Score ≥ ' + state.min);
    var inp = el('input'); inp.type = 'range'; inp.min = 0; inp.max = 10; inp.step = 0.5; inp.value = state.min;
    inp.oninput = function () { state.min = parseFloat(inp.value); lab.textContent = 'Score ≥ ' + state.min; draw(); };
    r.append(lab, inp); bar.append(r);
  }
  var count = el('p', null, 'count'), wrap = el('div', null, 'wrap'), tbl = el('table'), head = el('thead'), body = el('tbody');
  tbl.append(head, body); wrap.append(tbl); host.append(bar, count, wrap);

  function draw() {
    var needle = state.q.trim().toLowerCase();
    var rows = t.rows.filter(function (r) {
      for (var k in state.f) if (state.f[k] && r[k] !== state.f[k]) return false;
      if (sc && state.min > 0 && !((num(r[sc]) || 0) >= state.min)) return false;
      if (!needle) return true;
      return [r.Company, r.company, r.Role, r.title, r.Location, r.location, r.Skills, r.Reason].join(' ').toLowerCase().indexOf(needle) >= 0;
    });
    if (state.sort) {
      var k = state.sort, d = state.dir;
      rows = rows.slice().sort(function (a, b) {
        var x = num(a[k]), y = num(b[k]);
        if (x !== null || y !== null) return ((x === null ? -1 : x) - (y === null ? -1 : y)) * d;
        return String(a[k] || '').localeCompare(String(b[k] || '')) * d;
      });
    }
    count.textContent = rows.length + ' of ' + t.rows.length + ' rows · click a row for every detail · click a header to sort';
    var hr = el('tr');
    t.cols.forEach(function (c) {
      var th = el('th', c.replace(/_/g, ' '));
      if (state.sort === c) th.append(el('span', state.dir > 0 ? ' ▲' : ' ▼', 'arrow'));
      th.onclick = function () { if (state.sort === c) state.dir = -state.dir; else { state.sort = c; state.dir = -1; } draw(); };
      hr.append(th);
    });
    head.replaceChildren(hr);
    if (!rows.length) {
      var td = el('td', t.rows.length ? 'Nothing matches these filters.' : 'No data yet — run the tool first.', 'empty');
      td.colSpan = t.cols.length; var tr0 = el('tr'); tr0.append(td); body.replaceChildren(tr0); return;
    }
    var out = [];
    rows.forEach(function (r, i) {
      var key = (r.Link || r.URL || r.url || '') + '|' + i;
      var tr = el('tr', null, state.open === key ? 'open' : '');
      t.cols.forEach(function (c) { tr.append(cell(c, r[c] || '')); });
      tr.onclick = function () { state.open = state.open === key ? null : key; draw(); };
      out.push(tr);
      if (state.open === key) {
        var dtr = el('tr', null, 'detail'), dtd = el('td'); dtd.colSpan = t.cols.length;
        dtd.append(details(r)); dtr.append(dtd); out.push(dtr);
      }
    });
    body.replaceChildren.apply(body, out);
  }
  draw();
}

function nav() {
  var n = document.getElementById('nav'); n.replaceChildren();
  var brand = el('div', null, 'brand'); var b = el('div'); b.append(el('b', 'Job Dashboard'), el('small', 'Updated ' + DATA.updated));
  brand.append(el('div', null, 'logo'), b); n.append(brand);
  GROUPS.forEach(function (g) {
    var items = g === 'Start here'
      ? [{ id: 'queue', label: 'Apply next', n: todoCount(), hot: true }, { id: 'overview', label: 'Overview' }]
      : tabsIn(g).map(function (t) { return { id: t.id, label: t.label, n: t.rows.length }; });
    if (!items.length) return;
    var h = el('div', g, 'group'); var dot = el('i'); dot.style.background = GROUP_COLOR[g]; h.prepend(dot); n.append(h);
    items.forEach(function (t) {
      var btn = el('button', null, 'nav-btn' + (state.tab === t.id ? ' active' : '') + (t.hot && t.n ? ' hot' : ''));
      btn.append(el('span', t.label)); if (t.n != null) btn.append(el('span', String(t.n), 'n'));
      btn.onclick = function () { go(t.id); };
      n.append(btn);
    });
  });
}

function render() {
  nav();
  var main = document.getElementById('main'); main.replaceChildren();
  if (state.tab === 'queue') return queuePage(main);
  var t = tabById(state.tab);
  if (!t) { if (state.tab !== 'overview') { state.tab = 'overview'; nav(); } return overview(main); }
  var h = el('h1', t.label); h.style.borderLeft = '4px solid ' + GROUP_COLOR[t.group]; h.style.paddingLeft = '12px';
  var sub = el('div', t.about + ' ', 'sub'); sub.append(el('code', 'output/' + t.file));
  main.append(h, sub);
  var card = el('div', null, 'card'), inner = el('div'); inner.style.padding = '14px 16px'; card.append(inner); main.append(card);
  table(inner, t);
}
render();
</script>
</body>
</html>
`;

// `pnpm dashboard` rebuilds it without running anything else.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`dashboard: ${buildDashboard()}`);
}
