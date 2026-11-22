// Finds section headings and splits the resume into numbered passages: one per bullet,
// line or paragraph. Later, evidence for a skill cites a passage id, and the passage's
// section caps how strong that evidence can be (a skills list < a project < a job).
import type { Passage, ResumeSection } from '@skillbridge/shared';
import type { Line } from './layout.ts';

/** Heading text (lower-case, letters only, "&" as "and") → section. */
const HEADINGS: Record<string, ResumeSection> = {
  summary: 'summary',
  profile: 'summary',
  'profile summary': 'summary',
  'professional summary': 'summary',
  objective: 'summary',
  'career objective': 'summary',
  'about me': 'summary',

  skills: 'skills',
  'technical skills': 'skills',
  'key skills': 'skills',
  'core skills': 'skills',
  'core competencies': 'skills',
  'skills and tools': 'skills',
  'skills and technologies': 'skills',
  'tools and technologies': 'skills',
  'technical proficiency': 'skills',
  'programming languages': 'skills',
  technologies: 'skills',
  'tech stack': 'skills',
  tools: 'skills',
  'developer tools': 'skills',
  'tools and platforms': 'skills',
  'frameworks and libraries': 'skills',

  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  'experience and internships': 'experience',
  'internship experience': 'experience',
  internship: 'experience',
  internships: 'experience',
  employment: 'experience',
  'employment history': 'experience',
  'work history': 'experience',

  projects: 'projects',
  project: 'projects',
  'academic projects': 'projects',
  'personal projects': 'projects',
  'key projects': 'projects',
  'major projects': 'projects',

  education: 'education',
  'academic background': 'education',
  'academic qualifications': 'education',
  'educational qualifications': 'education',
  qualifications: 'education',

  certifications: 'certifications',
  certification: 'certifications',
  certificates: 'certifications',
  courses: 'certifications',
  'courses and certifications': 'certifications',
  'licenses and certifications': 'certifications',
  training: 'certifications',

  achievements: 'achievements',
  awards: 'achievements',
  'honors and awards': 'achievements',
  'awards and achievements': 'achievements',
  accomplishments: 'achievements',
  'extracurricular activities': 'achievements',
  'positions of responsibility': 'achievements',
  activities: 'achievements',
  leadership: 'achievements',

  languages: 'other',
  interests: 'other',
  hobbies: 'other',
  publications: 'other',
  references: 'other',
  volunteering: 'other',
  'volunteer experience': 'other',
  'personal details': 'other',
  'personal information': 'other',
  declaration: 'other',
};

const BULLET = /^\s*(?:[•●▪■◦○◆▸►➢➤✓✔∙·*]|[-–—](?=\s))\s*/u;
/** A passage this long is split, so one citation never covers half a page. */
const MAX_PASSAGE_CHARS = 600;

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The section a line starts, or null if it's ordinary content. */
export function headingSection(line: Line, bodyFontSize: number): ResumeSection | null {
  const label = normalise(line.text);
  if (!label || label.split(' ').length > 5) return null;

  const exact = HEADINGS[label];
  if (exact) {
    // "Skills" is a heading; "Skills: Python, Java" is content.
    return /:\s*\S/.test(line.text) ? null : exact;
  }

  // "PROJECTS (ACADEMIC)" or a larger "Work Experience — 2 years": starts like a heading
  // and looks like one.
  const looksLikeHeading = line.text === line.text.toUpperCase() || line.fontSize >= bodyFontSize * 1.15;
  if (!looksLikeHeading || line.text.includes(':')) return null;
  for (const [phrase, section] of Object.entries(HEADINGS)) {
    if (label.startsWith(`${phrase} `)) return section;
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 10;
}

/** Joins a wrapped line, undoing a hyphen split ("develop-" + "ment"). */
function join(a: string, b: string): string {
  return /\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b) ? a.slice(0, -1) + b : `${a} ${b}`;
}

/** The lines as numbered passages, and how many section headings were found. */
export function toPassages(lines: Line[]): { passages: Passage[]; headings: number } {
  const bodyFontSize = median(lines.map((l) => l.fontSize));
  const passages: Passage[] = [];
  let section: ResumeSection = 'header';
  let headings = 0;
  let current: { section: ResumeSection; page: number; text: string; last: Line } | null = null;

  const flush = () => {
    if (current?.text) passages.push({ id: passages.length + 1, section: current.section, page: current.page, text: current.text });
    current = null;
  };

  for (const line of lines) {
    const heading = headingSection(line, bodyFontSize);
    if (heading) {
      flush();
      section = heading;
      headings++;
      continue;
    }

    const bullet = BULLET.test(line.text);
    const text = line.text.replace(BULLET, '').trim();
    if (!text) continue;

    const last: Line | undefined = current?.last;
    // Vertical distance from the previous line, if it's in the same column of the same page.
    const gap = last && last.page === line.page && last.column === line.column ? last.y - line.y : -1;
    const newPassage =
      !current ||
      bullet ||
      section === 'header' || // name, email, phone: one passage each
      section === 'skills' || // skill lists: one passage per line
      gap < 0 || // new page, new column, or text above the last line
      gap > Math.max(last?.fontSize ?? 0, line.fontSize) * 1.7 || // a blank line: new paragraph
      current.text.length >= MAX_PASSAGE_CHARS;

    if (newPassage || !current) {
      flush();
      current = { section, page: line.page, text, last: line };
    } else {
      current.text = join(current.text, text);
      current.last = line;
    }
  }
  flush();
  return { passages, headings };
}
