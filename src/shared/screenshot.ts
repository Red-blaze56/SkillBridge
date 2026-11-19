/**
 * Failure screenshots for every bot: output/autoapply/<bot>/screenshots/,
 * newest 30 kept. Used when an application can't be finished, so you (or the
 * next fix) can see exactly what the form showed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Page } from 'playwright';
import { AUTOAPPLY_ROOT } from '../reports/csv.js';

const KEEP = 30;

/** Saves a screenshot of `page`; returns its path, or null if it couldn't be taken. */
export async function saveScreenshot(page: Page, bot: string, name: string): Promise<string | null> {
  try {
    const dir = path.join(AUTOAPPLY_ROOT, bot, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const slug  = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
    const file  = path.join(dir, `${stamp}_${slug}.png`);
    await page.screenshot({ path: file, timeout: 10_000 });
    const old = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().reverse().slice(KEEP);
    for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
    return file;
  } catch {
    return null;
  }
}
