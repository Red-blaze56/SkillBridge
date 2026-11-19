import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildDashboard } from '../reports/dashboard.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve('output', 'jobscout');
const WIN = process.platform === 'win32';
const VENV_PY = path.join(DIR, '.venv', WIN ? 'Scripts' : 'bin', WIN ? 'python.exe' : 'python');
const SYSTEM_PY = WIN ? 'python' : 'python3';

function exec(cmd: string, args: string[]): number {
  const r = spawnSync(cmd, args, {
    cwd: DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      JOBSCOUT_OUTPUT_DIR: OUTPUT_DIR,
      SCRAPER_OUTPUT_DIR: path.resolve('output', 'scraper'),
      PYTHONIOENCODING: 'utf-8',
    },
  });
  if (r.error) {
    console.error(`\nCould not start ${cmd}: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

function setup(): number {
  console.log('Creating virtual environment…');
  if (exec(SYSTEM_PY, ['-m', 'venv', '.venv']) !== 0) {
    console.error('Is Python 3.10+ installed and on PATH? Check with: python --version');
    return 1;
  }
  console.log('Installing packages…');
  const code = exec(VENV_PY, ['-m', 'pip', 'install', '-r', 'requirements.txt']);
  if (code === 0) console.log('\nSetup done. Next: pnpm start:jobscout-profile');
  return code;
}

function reset(): number {
  const seen = path.join(DIR, 'data', 'seen.json');
  if (fs.existsSync(seen) && fs.readFileSync(seen, 'utf8').trim() !== '{}') {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    const backup = path.join(OUTPUT_DIR, `seen-backup-${stamp}.json`);
    fs.copyFileSync(seen, backup);
    console.log(`Backed up history to ${backup}`);
  }
  fs.writeFileSync(seen, '{}\n');
  console.log('Cleared seen.json — the next run looks at every job again.');
  return 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args[0] === 'setup') return setup();
  if (args[0] === 'reset') return reset();

  if (!fs.existsSync(VENV_PY)) {
    console.error('Python environment not found. Run `pnpm start:jobscout-setup` first.');
    return 1;
  }
  const code = exec(VENV_PY, ['-m', 'jobhunt', ...args]);

  // Every command that changes output/ rebuilds the dashboard.
  if (['run', 'scan', 's', 'scrape', 'delete-all', 'del-all'].includes(args[0])) {
    try {
      console.log(`dashboard: ${buildDashboard()}`);
    } catch (err) {
      console.error(`could not build dashboard: ${(err as Error).message}`);
    }
  }
  return code;
}

process.exit(main());
