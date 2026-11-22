// How well a student fits a posting, from their skill gap analysis. Computed in code:
// the same analysis and posting always give the same score, and every score comes with
// the skills behind it.
import type { AnalysisResult } from '@skillbridge/shared';

/** For a fresher job, a skill used in a project (level 2) is enough. */
export const ENOUGH_LEVEL = 2;

export interface SkillFit {
  skillId: string;
  name: string;
  /** 0-3 from the analysis. */
  level: number;
  /** The skill's weight in the analysed role: 3 core, 2 important, 1 nice to have. */
  weight: number;
}

export interface Match {
  /** 0-100: how much of what the posting asks for the resume shows. Null if it names none of the role's skills. */
  score: number | null;
  /** Shown at project level or better. */
  strong: SkillFit[];
  /** Only listed on the resume. */
  weak: SkillFit[];
  /** Not shown on the resume. */
  missing: SkillFit[];
  /** Named by the posting but not part of the analysed role, so not checked. */
  unchecked: string[];
}

/** A posting must name this many checked skills before its score counts in full when ranking. */
export const FULL_CONFIDENCE_SKILLS = 3;

/**
 * How high a match ranks. The shown score stays the same, but a job that names one skill the
 * student has (score 100) shouldn't outrank one that names four and scores 80: the score is
 * scaled by min(1, checked skills ÷ 3). Null scores rank last.
 */
export function rankValue(match: Match): number {
  if (match.score === null) return -1;
  const checked = match.strong.length + match.weak.length + match.missing.length;
  return match.score * Math.min(1, checked / FULL_CONFIDENCE_SKILLS);
}

/** Best first: rank value, then more skills shown, then the newest posting. */
export function compareMatches(
  a: { match: Match; postedAt: Date | null },
  b: { match: Match; postedAt: Date | null },
): number {
  return (
    rankValue(b.match) - rankValue(a.match) ||
    b.match.strong.length - a.match.strong.length ||
    (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0)
  );
}

/**
 * Score = Σ weight × min(level, 2) ÷ 2 ÷ Σ weight, over the skills the posting names that
 * the analysis checked. Core skills of the role count three times a nice-to-have.
 */
export function matchPosting(postingSkills: readonly string[], analysis: Pick<AnalysisResult, 'skills'>): Match {
  const assessed = new Map(analysis.skills.map((s) => [s.skillId, s]));
  const fits: SkillFit[] = [];
  const unchecked: string[] = [];
  for (const id of postingSkills) {
    const s = assessed.get(id);
    if (s) fits.push({ skillId: id, name: s.name, level: s.level, weight: s.weight });
    else unchecked.push(id);
  }

  const total = fits.reduce((sum, f) => sum + f.weight, 0);
  const earned = fits.reduce((sum, f) => sum + (f.weight * Math.min(f.level, ENOUGH_LEVEL)) / ENOUGH_LEVEL, 0);
  const byImportance = (a: SkillFit, b: SkillFit) => b.weight - a.weight || a.name.localeCompare(b.name);

  return {
    score: total === 0 ? null : Math.round((100 * earned) / total),
    strong: fits.filter((f) => f.level >= ENOUGH_LEVEL).sort(byImportance),
    weak: fits.filter((f) => f.level === 1).sort(byImportance),
    missing: fits.filter((f) => f.level === 0).sort(byImportance),
    unchecked,
  };
}
