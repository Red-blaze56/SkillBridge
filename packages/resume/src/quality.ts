// The quality gate: is the extracted text good enough to analyse? If not, the resume is
// marked unreadable (later, a vision model can read the page images instead).
import type { ResumeQuality } from '@skillbridge/shared';
import type { Line } from './layout.ts';

/** Fewer visible characters than this is a scanned or image-only PDF. */
export const MIN_CHARACTERS = 250;
/** Below this share of letters, the text came out garbled (a broken font encoding). */
export const MIN_LETTER_SHARE = 0.55;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[\s().-]?){10,14}/;

export function checkQuality(lines: Line[], headings: number): ResumeQuality {
  const text = lines.map((l) => l.text).join('\n');
  const visible = text.replace(/\s/g, '');
  const letters = visible.match(/\p{L}/gu)?.length ?? 0;
  const problems: string[] = [];
  const notes: string[] = [];

  if (visible.length < MIN_CHARACTERS) {
    problems.push('Very little text could be read. Is this a scanned or image-only PDF?');
  } else if (letters / visible.length < MIN_LETTER_SHARE) {
    problems.push('The text came out garbled, probably because of an unusual font. Try exporting the PDF again.');
  }
  if (headings < 2) notes.push('Few resume sections (Skills, Experience, Education…) were recognised.');
  if (!EMAIL.test(text) && !PHONE.test(text)) notes.push('No email address or phone number was found.');

  return { readable: problems.length === 0, problems, notes };
}
