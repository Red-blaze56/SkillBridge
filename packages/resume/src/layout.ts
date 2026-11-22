// Puts a page's visible text back into reading order: finds a two-column layout,
// then groups text into lines.
import type { PageText, StyledRun } from './pdf.ts';

export interface Line {
  text: string;
  page: number;
  /** Left edge and baseline, in points. */
  x: number;
  y: number;
  fontSize: number;
  /** 0 = full width or left column, 1 = right column. */
  column: number;
}

const GUTTER_BINS = 60;
/** Each column must hold at least this share of the page's characters. */
const MIN_COLUMN_SHARE = 0.2;
/** Both columns must run down at least this share of the text's height. */
const MIN_COLUMN_HEIGHT = 0.4;

const chars = (runs: StyledRun[]) => runs.reduce((n, r) => n + r.text.trim().length, 0);

/**
 * The x position of a vertical gap between two columns, or null for a single column.
 * Text crossing each strip of the page is counted; a gutter is the widest empty band in
 * the middle 60% of the page, with real text on both sides. Right-aligned dates don't
 * qualify: they hold too few characters.
 */
export function findGutter(runs: StyledRun[], [x0, , x1]: PageText['box']): number | null {
  if (runs.length < 10) return null;
  const width = x1 - x0;
  const crossing = new Array<number>(GUTTER_BINS).fill(0);
  for (const r of runs) {
    const from = Math.max(0, Math.floor(((r.x - x0) / width) * GUTTER_BINS));
    const to = Math.min(GUTTER_BINS - 1, Math.floor(((r.x + r.width - x0) / width) * GUTTER_BINS));
    for (let b = from; b <= to; b++) crossing[b] = (crossing[b] ?? 0) + 1;
  }

  // Widest band of strips (in the middle of the page) that almost nothing crosses.
  const quiet = Math.max(1, Math.floor(runs.length * 0.03));
  let best: [number, number] | null = null;
  for (let b = Math.floor(GUTTER_BINS * 0.2); b < GUTTER_BINS * 0.8; b++) {
    if ((crossing[b] ?? 0) > quiet) continue;
    let end = b;
    while (end + 1 < GUTTER_BINS * 0.8 && (crossing[end + 1] ?? 0) <= quiet) end++;
    if (!best || end - b > best[1] - best[0]) best = [b, end];
    b = end;
  }
  if (!best) return null;
  const gutter = x0 + ((best[0] + best[1] + 1) / 2 / GUTTER_BINS) * width;

  const left = runs.filter((r) => r.x + r.width <= gutter);
  const right = runs.filter((r) => r.x >= gutter);
  const total = chars(runs);
  if (chars(left) < total * MIN_COLUMN_SHARE || chars(right) < total * MIN_COLUMN_SHARE) return null;

  const span = (rs: StyledRun[]) => Math.max(...rs.map((r) => r.y)) - Math.min(...rs.map((r) => r.y));
  const height = span(runs) || 1;
  if (span(left) < height * MIN_COLUMN_HEIGHT || span(right) < height * MIN_COLUMN_HEIGHT) return null;
  return gutter;
}

/** Groups runs into lines: top to bottom, then left to right. */
function toLines(runs: StyledRun[], page: number, column: number): Line[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: StyledRun[][] = [];
  for (const run of sorted) {
    const line = groups.at(-1);
    const ref = line?.[0];
    if (line && ref && Math.abs(ref.y - run.y) <= Math.max(ref.fontSize, run.fontSize) * 0.4) line.push(run);
    else groups.push([run]);
  }
  return groups.map((group) => {
    group.sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const run of group) {
      const gap = run.x - end;
      if (text && gap > run.fontSize * 0.15 && !text.endsWith(' ') && !run.text.startsWith(' ')) text += ' ';
      text += run.text;
      end = run.x + run.width;
    }
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      page,
      x: group[0]!.x,
      y: group[0]!.y,
      fontSize: Math.max(...group.map((r) => r.fontSize)),
      column,
    };
  });
}

/** The page's visible runs as lines in reading order, and how many columns it has. */
export function readingOrder(runs: StyledRun[], box: PageText['box'], page: number): { lines: Line[]; columns: number } {
  const gutter = findGutter(runs, box);
  if (gutter === null) return { lines: toLines(runs, page, 0), columns: 1 };

  const left = runs.filter((r) => r.x + r.width / 2 < gutter && r.x + r.width <= gutter + 2);
  const right = runs.filter((r) => r.x >= gutter - 2);
  const spanning = runs.filter((r) => !left.includes(r) && !right.includes(r));

  // Text crossing the gutter (usually the name at the top) goes first if it's above
  // both columns, otherwise last.
  const top = Math.max(...[...left, ...right].map((r) => r.y));
  const above = spanning.filter((r) => r.y > top);
  const below = spanning.filter((r) => r.y <= top);
  return {
    lines: [
      ...toLines(above, page, 0),
      ...toLines(left, page, 0),
      ...toLines(right, page, 1),
      ...toLines(below, page, 0),
    ],
    columns: 2,
  };
}
