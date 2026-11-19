import path from 'path';
import os   from 'os';
import fs   from 'fs';
import { spawn } from 'child_process';
import { chromium, BrowserContext, Page } from 'playwright';
import * as log from './logger.js';

/** Where the persistent browser profile is stored. */
const PROFILE_DIR = path.join(os.homedir(), '.wellfound-automation', 'browser-profile');

/**
 * Resolves a Chromium-based browser binary for the current OS.
 *
 * Priority:
 *   1. BROWSER_PATH env variable (any browser, user-specified)
 *   2. Brave (preferred — less bot-detection than Chrome)
 *   3. Google Chrome
 *   4. Chromium
 *
 * Set BROWSER_PATH in your shell or .env to use a custom path:
 *   BROWSER_PATH="/path/to/browser" pnpm start
 */
function getBrowserPath(): string | undefined {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;

  const candidates: Record<string, string[]> = {
    darwin: [
      // Brave
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      // Chrome
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // Chromium
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: [
      // Brave
      '/usr/bin/brave-browser',
      '/usr/bin/brave',
      '/usr/local/bin/brave-browser',
      '/snap/bin/brave',
      // Chrome
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/local/bin/google-chrome',
      // Chromium
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ],
    win32: [
      // Brave
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      `${os.homedir()}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      // Chrome
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    ],
  };

  for (const p of candidates[process.platform] ?? []) {
    if (fs.existsSync(p)) return p;
  }

  return undefined;
}

const BROWSER_PATH = getBrowserPath();

/**
 * Local DevTools port of the shared browser. Every bot connects to the same
 * browser on this port and works in its own tab, so several bots can run at
 * once from different terminals. Override with BROWSER_DEBUG_PORT.
 */
const DEBUG_PORT = Number(process.env.BROWSER_DEBUG_PORT) || 9222;
const CDP_URL    = `http://127.0.0.1:${DEBUG_PORT}`;

/** This bot's own tab (one per process). */
let botPage: Page | null = null;
/** True when this process started the browser (it may reuse the first blank tab). */
let startedHere = false;

async function isBrowserUp(): Promise<boolean> {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Starts the browser as its own process, so it outlives the bot that opened it. */
function startBrowser(): void {
  const exe = BROWSER_PATH ?? chromium.executablePath();
  spawn(exe, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--start-maximized',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Connects to the shared browser, starting it first if no bot has yet.
 * The persistent profile keeps the login sessions across runs.
 */
export async function launchBrowser(): Promise<BrowserContext> {
  log.step(`Using browser profile: ${PROFILE_DIR}`);

  if (await isBrowserUp()) {
    log.step(`Shared browser already open (port ${DEBUG_PORT}) — this bot gets its own tab`);
  } else {
    log.step(BROWSER_PATH ? `Starting browser: ${BROWSER_PATH}` : 'Starting Playwright Chromium');
    startBrowser();
    startedHere = true;

    const deadline = Date.now() + 20000;
    while (!(await isBrowserUp())) {
      if (Date.now() > deadline) {
        throw new Error(
          `Browser did not open its debug port ${DEBUG_PORT}. A browser window from an older run is ` +
          'probably still using the bot profile — close it and run again.'
        );
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const browser = await chromium.connectOverCDP(CDP_URL, { slowMo: 80 });
  return browser.contexts()[0] ?? browser.newContext();
}

/**
 * Returns this bot's own tab — the same one on every call, so bots running
 * side by side never drive each other's pages.
 */
export async function getActivePage(context: BrowserContext): Promise<Page> {
  if (botPage && !botPage.isClosed()) return botPage;

  const blank = startedHere ? context.pages().find((p) => p.url() === 'about:blank') : undefined;
  startedHere = false;
  botPage = blank ?? (await context.newPage());
  return botPage;
}

/**
 * Closes this bot's tab and disconnects. The browser itself is closed only
 * when no other bot still has a tab open in it.
 */
export async function closeBrowser(context: BrowserContext): Promise<void> {
  await botPage?.close().catch(() => undefined);
  botPage = null;

  const browser = context.browser();
  if (!browser) return;

  const othersOpen = context.pages().some((p) => !p.isClosed() && p.url() !== 'about:blank');
  if (!othersOpen) {
    const cdp = await browser.newBrowserCDPSession().catch(() => null);
    await cdp?.send('Browser.close').catch(() => undefined);
  }
  await browser.close().catch(() => undefined);
}
