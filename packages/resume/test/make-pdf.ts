// Builds test resumes with pdf-lib, including ones that hide text from the reader.
import {
  PDFDocument,
  StandardFonts,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setTextRenderingMode,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

export const BLACK = rgb(0, 0, 0);
export const WHITE = rgb(1, 1, 1);

interface TextOptions {
  x?: number;
  size?: number;
  bold?: boolean;
  color?: RGB;
  opacity?: number;
}

/** One page, written top to bottom like a resume. */
export class Page {
  readonly pdf: PDFPage;
  readonly font: PDFFont;
  readonly bold: PDFFont;
  /** Baseline of the next line. */
  y = 800;

  constructor(pdf: PDFPage, font: PDFFont, bold: PDFFont) {
    this.pdf = pdf;
    this.font = font;
    this.bold = bold;
  }

  /** Writes text at (x, y) without moving the cursor. */
  at(text: string, x: number, y: number, { size = 10, bold = false, color = BLACK, opacity = 1 }: TextOptions = {}) {
    this.pdf.drawText(text, { x, y, size, font: bold ? this.bold : this.font, color, opacity });
  }

  /** Writes a line and moves down. */
  line(text: string, options: TextOptions = {}) {
    this.at(text, options.x ?? 50, this.y, options);
    this.y -= (options.size ?? 10) * 1.45;
  }

  heading(text: string, x = 50) {
    this.y -= 6;
    this.line(text, { x, size: 12, bold: true });
  }

  /** Text drawn in render mode 3: placed on the page, never painted. */
  invisible(text: string, x: number, y: number) {
    this.pdf.pushOperators(pushGraphicsState(), setTextRenderingMode(3));
    this.at(text, x, y);
    this.pdf.pushOperators(popGraphicsState());
  }

  width(text: string, size = 10) {
    return this.font.widthOfTextAtSize(text, size);
  }
}

export async function makePdf(draw: (pages: Page[]) => void, pageCount = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = Array.from({ length: pageCount }, () => new Page(doc.addPage([595, 842]), font, bold));
  draw(pages);
  return doc.save();
}

/** A plain one-column resume with every usual section. */
export function writeResume(page: Page) {
  page.line('Asha Verma', { size: 18, bold: true });
  page.line('asha.verma@example.com | +91 98765 43210 | github.com/ashav');
  page.heading('SUMMARY');
  page.line('Final-year computer science student who enjoys building reliable backend services.');
  page.heading('SKILLS');
  page.line('Languages: JavaScript, TypeScript, Python');
  page.line('Frameworks: Node.js, Express, React');
  page.heading('EXPERIENCE');
  page.at('Jun 2025 – Aug 2025', 470, page.y);
  page.line('Backend Intern, Acme Labs', { bold: true });
  page.line('• Built REST APIs in Node.js and Express serving 12k requests a day');
  page.line('• Added Redis caching, cutting response times by 40%');
  page.heading('PROJECTS');
  page.line('Library Management System', { bold: true });
  page.line('• Designed a REST API with JWT login and MongoDB, used by 300 students');
  page.line('• Indexed book titles so that search results come back in under 50 ms');
  page.heading('EDUCATION');
  page.line('B.Tech in Computer Science, Galgotias College of Engineering, 2022 – 2026');
}
