// Reads a PDF with pdf.js: every piece of text with its position, size, fill colour,
// opacity, render mode, and what is painted underneath it.
//
// pdf.js gives text positions (getTextContent) and drawing operations
// (getOperatorList) separately. Both list text in drawing order, so their characters
// are matched one by one to learn each character's colour and render mode.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type Rgb = [number, number, number];

/** A piece of text drawn with one style. Coordinates are PDF points, origin bottom-left. */
export interface StyledRun {
  text: string;
  x: number;
  y: number; // baseline
  width: number;
  fontSize: number;
  /** Fill colour, or null when unknown (pattern fill, or the characters couldn't be matched). */
  fill: Rgb | null;
  /** 0 = fully transparent, 1 = opaque. */
  opacity: number;
  /** PDF text render mode: 3 = invisible, 7 = clipping only. */
  renderMode: number;
  /** What is painted underneath: a colour, 'unknown' (an image or gradient), or null (bare page). */
  background: Rgb | 'unknown' | null;
}

export interface PageText {
  /** The page's visible area [x0, y0, x1, y1]. */
  box: [number, number, number, number];
  runs: StyledRun[];
  /** Text drawn outside the page, which pdf.js leaves out of `runs`. */
  offPage: string[];
}

export type PdfErrorCode = 'not-a-pdf' | 'encrypted' | 'too-many-pages' | 'timeout' | 'unreadable';

/** A PDF that can't be used. The message is safe to show the student. */
export class PdfError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const pdfjsDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 × m2: apply m2 first, then m1 (pdf.js convention). */
function multiply(m1: Matrix, m2: ArrayLike<number>): Matrix {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = Array.from(m2);
  return [
    m1[0] * a + m1[2] * b,
    m1[1] * a + m1[3] * b,
    m1[0] * c + m1[2] * d,
    m1[1] * c + m1[3] * d,
    m1[0] * e + m1[2] * f + m1[4],
    m1[1] * e + m1[3] * f + m1[5],
  ];
}

/** The axis-aligned box covering [x0, y0, x1, y1] after transforming it by m. */
function transformBox(m: Matrix, [x0, y0, x1, y1]: number[]): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as [number, number][]) {
    xs.push(x * m[0] + y * m[2] + m[4]);
    ys.push(x * m[1] + y * m[3] + m[5]);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function hexToRgb(hex: unknown): Rgb | null {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const known = (...ops: (number | undefined)[]) => new Set(ops.filter((op): op is number => op !== undefined));
const FILL_PAINTS = known(OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke);
const IMAGE_PAINTS = known(
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintSolidColorImageMask,
);
const SHOW_TEXT = known(OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText);

interface DrawnChar {
  ch: string;
  op: number; // index of the drawing operation, i.e. when it was painted
  fill: Rgb | null;
  opacity: number;
  renderMode: number;
  /** The text operation started outside the page (pdf.js leaves such text out of its text content). */
  offPage: boolean;
  /** Found in pdf.js's text content. */
  matched?: boolean;
}

interface Region {
  op: number;
  box: [number, number, number, number];
  colour: Rgb | 'unknown';
}

/** Characters and filled areas from the page's drawing operations, in painting order. */
function walkOperators(fnArray: number[], argsArray: unknown[][], pageBox: PageText['box']) {
  type State = { ctm: Matrix; fill: Rgb | null; opacity: number; renderMode: number; leading: number };
  let state: State = { ctm: IDENTITY, fill: [0, 0, 0], opacity: 1, renderMode: 0, leading: 0 };
  const stack: State[] = [];
  const chars: DrawnChar[] = [];
  const regions: Region[] = [];
  // Where the next text starts: the text line matrix (only start positions are tracked).
  let line: Matrix = IDENTITY;
  const [px0, py0, px1, py1] = pageBox;
  const offPage = () => {
    const m = multiply(state.ctm, line);
    return m[4] < px0 || m[4] > px1 || m[5] < py0 || m[5] > py1;
  };
  const nextLine = () => {
    line = multiply(line, [1, 0, 0, 1, 0, -state.leading]);
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i] ?? -1;
    const args = argsArray[i] ?? [];
    switch (fn) {
      case OPS.save:
        stack.push({ ...state });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ...state });
        if (args[0]) state.ctm = multiply(state.ctm, args[0] as number[]);
        break;
      case OPS.paintFormXObjectEnd:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state.ctm = multiply(state.ctm, args as number[]);
        break;
      case OPS.setFillRGBColor:
        state.fill = hexToRgb(args[0]);
        break;
      case OPS.setFillColorN: // pattern or shading fill: colour unknown
        state.fill = null;
        break;
      case OPS.setTextRenderingMode:
        state.renderMode = Number(args[0]) || 0;
        break;
      case OPS.beginText:
        line = IDENTITY;
        break;
      case OPS.setTextMatrix:
        line = multiply(IDENTITY, (args[0] ?? args) as ArrayLike<number>);
        break;
      case OPS.setLeading:
        state.leading = Number(args[0]) || 0;
        break;
      case OPS.setLeadingMoveText:
        state.leading = -(Number(args[1]) || 0);
        line = multiply(line, [1, 0, 0, 1, Number(args[0]) || 0, Number(args[1]) || 0]);
        break;
      case OPS.moveText:
        line = multiply(line, [1, 0, 0, 1, Number(args[0]) || 0, Number(args[1]) || 0]);
        break;
      case OPS.nextLine:
        nextLine();
        break;
      case OPS.setGState:
        for (const entry of (args[0] as unknown[][] | undefined) ?? []) {
          if (entry[0] === 'ca' && typeof entry[1] === 'number') state.opacity = entry[1];
        }
        break;
      case OPS.constructPath: {
        // pdf.js 5+: [paintOp, pathData, minMax], minMax in user space.
        const [paint, , minMax] = args as [number, unknown, ArrayLike<number> | null];
        if (FILL_PAINTS.has(paint) && minMax && Array.from(minMax).every(Number.isFinite)) {
          regions.push({ op: i, box: transformBox(state.ctm, Array.from(minMax)), colour: state.fill ?? 'unknown' });
        }
        break;
      }
      case OPS.shadingFill: // a gradient fills the clip area: treat the whole page as unknown
        regions.push({ op: i, box: pageBox, colour: 'unknown' });
        break;
      default:
        if (IMAGE_PAINTS.has(fn)) {
          regions.push({ op: i, box: transformBox(state.ctm, [0, 0, 1, 1]), colour: 'unknown' });
        } else if (SHOW_TEXT.has(fn)) {
          if (fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) nextLine();
          const glyphs = (fn === OPS.nextLineSetSpacingShowText ? args[2] : args[0]) as unknown[] | undefined;
          const outside = offPage();
          for (const glyph of glyphs ?? []) {
            const unicode = glyph && typeof glyph === 'object' && 'unicode' in glyph ? String(glyph.unicode) : '';
            for (const ch of unicode) {
              if (ch.trim()) {
                chars.push({ ch, op: i, fill: state.fill, opacity: state.opacity, renderMode: state.renderMode, offPage: outside });
              }
            }
          }
        }
    }
  }
  return { chars, regions };
}

/** What was painted under the point (x, y) before operation `op`: the topmost earlier region. */
function backgroundAt(regions: Region[], op: number, x: number, y: number): Rgb | 'unknown' | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i]!;
    if (r.op < op && x >= r.box[0] && x <= r.box[2] && y >= r.box[1] && y <= r.box[3]) return r.colour;
  }
  return null;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

/**
 * Splits each text item into runs of one style, matching its characters to the
 * drawing operations. A character that can't be matched gets an unknown style
 * (fill null), which counts as visible: the check never guesses something is hidden.
 */
function styledRuns(items: TextItem[], chars: DrawnChar[], regions: Region[]): StyledRun[] {
  const runs: StyledRun[] = [];
  let next = 0; // position in `chars`

  for (const item of items) {
    const str = item.str;
    if (!str.trim()) continue;
    const t = item.transform;
    const fontSize = Math.hypot(t[2] ?? 0, t[3] ?? 0) || Math.hypot(t[0] ?? 0, t[1] ?? 0);
    const x0 = t[4] ?? 0;
    const y = t[5] ?? 0;

    // The drawing style of each character of this item (undefined for spaces).
    const styles: (DrawnChar | null | undefined)[] = [];
    for (const ch of str) {
      if (!ch.trim()) {
        styles.push(undefined);
        continue;
      }
      let found = -1;
      for (let k = next; k < Math.min(chars.length, next + 200); k++) {
        if (chars[k]!.ch === ch) {
          found = k;
          break;
        }
      }
      if (found >= 0) {
        chars[found]!.matched = true;
        styles.push(chars[found]);
        next = found + 1;
      } else {
        styles.push(null);
      }
    }

    // Spaces take the style of the character before them.
    for (let k = 0; k < styles.length; k++) if (styles[k] === undefined) styles[k] = k > 0 ? styles[k - 1] : undefined;

    const length = styles.length;
    const key = (s: DrawnChar | null | undefined) =>
      s ? `${s.fill?.join(',') ?? '?'}|${s.opacity}|${s.renderMode}` : '?';
    let start = 0;
    const letters = [...str];
    for (let k = 1; k <= length; k++) {
      if (k < length && key(styles[k]) === key(styles[start])) continue;
      const text = letters.slice(start, k).join('');
      const style = styles.slice(start, k).find((s) => s) ?? null;
      const x = x0 + (item.width * start) / length;
      const width = (item.width * (k - start)) / length;
      runs.push({
        text,
        x,
        y,
        width,
        fontSize,
        fill: style?.fill ?? null,
        opacity: style?.opacity ?? 1,
        renderMode: style?.renderMode ?? 0,
        background: style ? backgroundAt(regions, style.op, x + width / 2, y + fontSize * 0.35) : null,
      });
      start = k;
    }
  }
  return runs;
}

/**
 * Text drawn outside the page. pdf.js leaves it out of the text content, so it never
 * reaches the passages, but it's still reported: it's exactly how hidden instructions
 * get smuggled in.
 */
function offPageText(chars: DrawnChar[]): string[] {
  const pieces: string[] = [];
  let lastOp = -1;
  for (const c of chars) {
    if (!c.offPage || c.matched) continue;
    if (c.op === lastOp) pieces[pieces.length - 1] += c.ch;
    else pieces.push(c.ch);
    lastOp = c.op;
  }
  return pieces;
}

export interface ReadOptions {
  maxPages: number;
  timeoutMs: number;
}

/** Every page's text with its style. Throws PdfError for anything that isn't a usable PDF. */
export async function readPdf(bytes: Uint8Array, { maxPages, timeoutMs }: ReadOptions): Promise<PageText[]> {
  if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
    throw new PdfError('not-a-pdf', 'This file is not a PDF.');
  }

  const task = getDocument({
    data: new Uint8Array(bytes), // pdf.js takes ownership of the buffer, so pass a copy
    // No isEvalSupported option: pdf.js 6 no longer generates code from fonts at all,
    // which removed the eval path behind CVE-2024-4367.
    disableFontFace: true,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    standardFontDataUrl: join(pdfjsDir, 'standard_fonts') + '/',
    cMapUrl: join(pdfjsDir, 'cmaps') + '/',
    cMapPacked: true,
    verbosity: 0, // errors only
  });

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfError('timeout', 'Reading this PDF took too long.')), timeoutMs);
  });

  try {
    return await Promise.race([readPages(), timeout]);
  } catch (error) {
    if (error instanceof PdfError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new PdfError('encrypted', 'This PDF is password-protected. Upload a copy without a password.');
    }
    throw new PdfError('unreadable', 'This PDF could not be read. Try exporting it again as a PDF.');
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }

  async function readPages(): Promise<PageText[]> {
    const pdf = await task.promise;
    if (pdf.numPages > maxPages) {
      throw new PdfError('too-many-pages', `A resume can have at most ${maxPages} pages.`);
    }
    const pages: PageText[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
      const box: PageText['box'] = [x0, y0, x1, y1];
      const ops = await page.getOperatorList();
      const content = await page.getTextContent({ disableNormalization: true });
      const { chars, regions } = walkOperators(ops.fnArray, ops.argsArray as unknown[][], box);
      const items = content.items.filter((item) => 'str' in item) as TextItem[];
      const runs = styledRuns(items, chars, regions); // marks which characters it found
      pages.push({ box, runs, offPage: offPageText(chars) });
      page.cleanup();
    }
    return pages;
  }
}
