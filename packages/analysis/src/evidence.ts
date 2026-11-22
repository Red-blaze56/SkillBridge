// The checks every piece of evidence must pass before it counts. They run in code, so
// the AI can suggest evidence but can't make it count on its own.
import type { Passage, ResumeSection } from '@skillbridge/shared';
import type { RoleSkill } from '@skillbridge/roles';

export const LEVEL_NAMES = ['absent', 'mentioned', 'applied', 'professional'] as const;

/**
 * The strongest evidence each part of a resume can give: a skills list only shows a
 * skill is known (1), a project or award shows it applied (2), and only a job or
 * internship shows professional use (3).
 */
export const SECTION_CAP: Record<ResumeSection, number> = {
  header: 1,
  summary: 1,
  skills: 1,
  education: 1,
  certifications: 1,
  other: 1,
  achievements: 2,
  projects: 2,
  experience: 3,
};

export const MAX_QUOTE_CHARS = 300;

/** What the AI submits for one skill. */
export interface Submission {
  skillId: string;
  level: number;
  passageId?: number | null;
  quote?: string | null;
}

/** Evidence that passed every check. */
export interface Evidence {
  skillId: string;
  level: number;
  passageId: number | null;
  section: ResumeSection | null;
  quote: string | null;
  note: string | null;
}

export type Check = { ok: true; evidence: Evidence; message: string } | { ok: false; message: string };

/** Lower-case, one kind of quote and dash, single spaces: so a quote copied by the AI still matches. */
function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkEvidence(
  submission: Submission,
  skills: ReadonlyMap<string, RoleSkill>,
  passages: ReadonlyMap<number, Passage>,
): Check {
  const skill = skills.get(submission.skillId);
  if (!skill) return { ok: false, message: `"${submission.skillId}" is not one of this role's skills.` };

  const level = submission.level;
  if (!Number.isInteger(level) || level < 0 || level > 3) {
    return { ok: false, message: `${skill.name}: the level must be 0, 1, 2 or 3.` };
  }
  if (level === 0) {
    const evidence = { skillId: skill.id, level: 0, passageId: null, section: null, quote: null, note: null };
    return { ok: true, evidence, message: `${skill.name}: recorded as absent (0).` };
  }

  const passage = submission.passageId == null ? undefined : passages.get(submission.passageId);
  if (!passage) return { ok: false, message: `${skill.name}: passage #${submission.passageId} doesn't exist.` };

  const quote = (submission.quote ?? '').trim();
  if (quote.length < 3) return { ok: false, message: `${skill.name}: quote the words in passage #${passage.id} that show it.` };
  if (quote.length > MAX_QUOTE_CHARS) {
    return { ok: false, message: `${skill.name}: quote at most ${MAX_QUOTE_CHARS} characters.` };
  }
  if (!normalise(passage.text).includes(normalise(quote))) {
    return { ok: false, message: `${skill.name}: that quote isn't in passage #${passage.id}. Copy its exact words.` };
  }

  const cap = SECTION_CAP[passage.section];
  const accepted = Math.min(level, cap);
  const note =
    accepted < level
      ? `Lowered to ${accepted} (${LEVEL_NAMES[accepted]}): the ${passage.section} section can't show more than that.`
      : null;
  return {
    ok: true,
    evidence: { skillId: skill.id, level: accepted, passageId: passage.id, section: passage.section, quote, note },
    message: `${skill.name}: accepted at ${accepted} (${LEVEL_NAMES[accepted]}).${note ? ` ${note}` : ''}`,
  };
}
