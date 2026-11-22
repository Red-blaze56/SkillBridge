// The readiness score and the gap list, computed in code from accepted evidence only.
// Same evidence in, same numbers out.
import type { AnalysisResult, SkillAssessment, SkillGap } from '@skillbridge/shared';
import { roleSkills, type Role, type RoleSkill } from '@skillbridge/roles';
import type { Evidence } from './evidence.ts';

export const FORMULA_VERSION = '1.0.0';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The level a skill should reach: applied (2) for core and important skills, mentioned (1) otherwise. */
export function targetLevel(weight: number): number {
  return weight >= 2 ? 2 : 1;
}

/** Readiness = 100 × Σ weight × (level / 3) / Σ weight, as in the report (§3.6). */
export function readiness(skills: RoleSkill[], levels: ReadonlyMap<string, number>): number {
  const total = skills.reduce((sum, s) => sum + s.weight, 0);
  const earned = skills.reduce((sum, s) => sum + s.weight * ((levels.get(s.id) ?? 0) / 3), 0);
  return total ? round1((100 * earned) / total) : 0;
}

export interface ResultInputs {
  role: Role;
  /** Accepted evidence per skill id. Skills without any count as absent. */
  evidence: ReadonlyMap<string, Evidence>;
  promptVersion: string;
  model: string;
}

export function buildResult({ role, evidence, promptVersion, model }: ResultInputs): AnalysisResult {
  const skills = roleSkills(role);
  const total = skills.reduce((sum, s) => sum + s.weight, 0);
  const levels = new Map(skills.map((s) => [s.id, evidence.get(s.id)?.level ?? 0]));

  const assessments: SkillAssessment[] = skills.map((s) => {
    const e = evidence.get(s.id);
    const level = levels.get(s.id) ?? 0;
    return {
      skillId: s.id,
      name: s.name,
      weight: s.weight,
      level,
      evidence: e && e.level > 0 && e.passageId && e.section && e.quote ? { passageId: e.passageId, section: e.section, quote: e.quote } : null,
      note: e?.note ?? null,
      points: round1((100 * s.weight * (level / 3)) / total),
    };
  });

  const gaps: SkillGap[] = assessments
    .filter((a) => a.level < targetLevel(a.weight))
    .map((a) => ({ skillId: a.skillId, name: a.name, weight: a.weight, level: a.level, target: targetLevel(a.weight) }))
    .sort((a, b) => b.weight - a.weight || a.level - b.level || a.name.localeCompare(b.name));

  return {
    score: readiness(skills, levels),
    skills: assessments,
    gaps,
    roleId: role.id,
    roleVersion: role.version,
    formulaVersion: FORMULA_VERSION,
    promptVersion,
    model,
  };
}
