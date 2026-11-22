// Deterministic hidden-text check. It doesn't ask whether text is malicious (that would
// need a model and could be wrong); it asks whether a person reading the PDF can see
// it, which the PDF itself answers.
import type { PageText, Rgb, StyledRun } from './pdf.ts';

export type HiddenReason = 'invisible' | 'transparent' | 'too-small' | 'off-page' | 'blends-into-background';

/** Smaller than this (in points) is unreadable when printed. Resume body text is 9-12 pt. */
export const MIN_FONT_SIZE = 4;
/** Below this opacity text can't be seen. */
export const MIN_OPACITY = 0.1;
/**
 * WCAG contrast ratio between text and what's behind it: 1 means identical colours,
 * 21 is black on white. Light-grey text on white is about 1.4, so 1.2 only catches
 * text that practically vanishes.
 */
export const MIN_CONTRAST = 1.2;

const WHITE: Rgb = [255, 255, 255];

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Why this run can't be seen by a reader, or null if it can. */
export function hiddenReason(run: StyledRun, box: PageText['box']): HiddenReason | null {
  if (run.renderMode === 3 || run.renderMode === 7) return 'invisible';
  if (run.opacity < MIN_OPACITY) return 'transparent';
  if (run.fontSize < MIN_FONT_SIZE) return 'too-small';

  const [x0, y0, x1, y1] = box;
  if (run.x + run.width <= x0 || run.x >= x1 || run.y + run.fontSize <= y0 || run.y >= y1) return 'off-page';

  // Behind an image or gradient the background is unknown: give the benefit of the doubt.
  if (run.fill && run.background !== 'unknown') {
    if (contrast(run.fill, run.background ?? WHITE) < MIN_CONTRAST) return 'blends-into-background';
  }
  return null;
}
