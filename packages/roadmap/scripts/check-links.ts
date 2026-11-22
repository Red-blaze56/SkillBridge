// Checks every catalogue URL (report §3.7: "a manual link-validation process can mark broken
// links"). Run: pnpm --filter @skillbridge/roadmap check-links
// Exits with 1 if any link is broken, so it can run in CI or before a release.
import { RESOURCES } from '../src/catalogue.ts';

const USER_AGENT = 'Mozilla/5.0 (compatible; SkillBridge-link-check/1.0; college project)';
const CONCURRENCY = 3;

async function check(url: string): Promise<{ status: number | string; finalUrl: string }> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      await res.body?.cancel();
      if (res.ok || method === 'GET') return { status: res.status, finalUrl: res.url };
    } catch (error) {
      if (method === 'GET') return { status: error instanceof Error ? error.message : String(error), finalUrl: url };
    }
  }
  return { status: 'unreachable', finalUrl: url };
}

const problems: string[] = [];
const moved: string[] = [];
let next = 0;
async function worker() {
  for (let i = next++; i < RESOURCES.length; i = next++) {
    const resource = RESOURCES[i]!;
    const { status, finalUrl } = await check(resource.url);
    if (status !== 200) problems.push(`${resource.id}: ${status} ${resource.url}`);
    else if (finalUrl.replace(/\/$/, '') !== resource.url.replace(/\/$/, '')) moved.push(`${resource.id}: ${resource.url} → ${finalUrl}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`Checked ${RESOURCES.length} links: ${RESOURCES.length - problems.length} answer 200.`);
if (moved.length) console.log(`Redirected (works, but consider the new URL):\n  ${moved.join('\n  ')}`);
if (problems.length) {
  console.log(`Broken:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
