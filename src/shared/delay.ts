/**
 * Speed of every bot's pauses: 0.5 = half the old waiting time (default), 1 = old speed,
 * 0.3 = even faster. Override for one run: `BOT_SPEED=0.7` in .env.
 * Only fixed "human" pauses are scaled — waits for a page or button to appear still
 * finish as soon as it's there, so nothing breaks from going faster.
 */
export const SPEED = Number(process.env.BOT_SPEED) > 0 ? Number(process.env.BOT_SPEED) : 0.5;

// Random 70–90% of the requested wait (never constant), scaled by SPEED.
export const humanDelay = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, Math.floor(ms * SPEED * (0.7 + Math.random() * 0.2))));

/** Short random pause between jobs (750–1250 ms at speed 1). */
export const betweenJobs = () =>
  new Promise<void>((r) => setTimeout(r, Math.floor((Math.random() * 500 + 750) * SPEED)));
