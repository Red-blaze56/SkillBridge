// Turns a skill gap analysis into an ordered learning plan (report §3.7). Rule-based: core
// gaps first, foundations before what builds on them, and every resource comes from the
// catalogue by id, so a plan can't contain a made-up link.
import type { AnalysisResult, Roadmap, RoadmapStep } from '@skillbridge/shared';
import { CATALOGUE_CHECKED_AT, PREREQUISITES, PROJECTS, RESOURCES } from './catalogue.ts';

/** Hours to raise a skill one level, by how much the role needs it. */
export const HOURS_PER_LEVEL: Record<number, number> = { 3: 14, 2: 10, 1: 6 };
export const HOURS_PER_WEEK = 8;

const OBJECTIVE: Record<number, (name: string) => string> = {
  1: (name) => `Learn the basics of ${name} well enough to list it honestly.`,
  2: (name) => `Use ${name} in a project you can show and explain.`,
  3: (name) => `Use ${name} in an internship or job.`,
};

const DONE_WHEN: Record<number, (name: string) => string> = {
  1: (name) => `${name} is on your resume, and you can talk through a small exercise you did with it.`,
  2: (name) => `A project line on your resume says what you built with ${name}, with a link to the code.`,
  3: (name) => `Your resume shows ${name} used at work.`,
};

/**
 * Orders the gaps so that a gap's prerequisites come before it when they are gaps too,
 * keeping the analysis's order (most important first) otherwise.
 */
function ordered<T extends { skillId: string }>(gaps: T[]): T[] {
  const byId = new Map(gaps.map((g) => [g.skillId, g]));
  const done = new Set<string>();
  const out: T[] = [];
  const visit = (gap: T, path: Set<string>) => {
    if (done.has(gap.skillId) || path.has(gap.skillId)) return;
    path.add(gap.skillId);
    for (const pre of PREREQUISITES[gap.skillId] ?? []) {
      const prerequisite = byId.get(pre);
      if (prerequisite) visit(prerequisite, path);
    }
    done.add(gap.skillId);
    out.push(gap);
  };
  for (const gap of gaps) visit(gap, new Set());
  return out;
}

export function buildRoadmap(analysisId: string, result: AnalysisResult): Roadmap {
  const steps: RoadmapStep[] = ordered(result.gaps).map((gap) => {
    const levels = Math.max(1, gap.target - gap.level);
    const resources = RESOURCES.filter((r) => r.skillId === gap.skillId && r.level <= Math.max(gap.target, 1))
      // Up to the target level, easiest first.
      .sort((a, b) => a.level - b.level || a.hours - b.hours)
      .map(({ id, title, provider, url, kind, hours }) => ({ id, title, provider, url, kind, hours }));
    const prerequisites = (PREREQUISITES[gap.skillId] ?? []).filter((id) => result.gaps.some((g) => g.skillId === id));
    return {
      skillId: gap.skillId,
      name: gap.name,
      weight: gap.weight,
      from: gap.level,
      to: gap.target,
      objective: OBJECTIVE[gap.target]?.(gap.name) ?? '',
      activity: gap.target >= 2 ? (PROJECTS[gap.skillId] ?? '') : 'Work through the first resource, then add the skill to your resume.',
      doneWhen: DONE_WHEN[gap.target]?.(gap.name) ?? '',
      hours: levels * (HOURS_PER_LEVEL[gap.weight] ?? 6),
      prerequisites,
      resources,
    };
  });
  const totalHours = steps.reduce((sum, s) => sum + s.hours, 0);
  return {
    analysisId,
    roleId: result.roleId,
    steps,
    totalHours,
    weeks: Math.ceil(totalHours / HOURS_PER_WEEK),
    hoursPerWeek: HOURS_PER_WEEK,
    catalogueCheckedAt: CATALOGUE_CHECKED_AT,
  };
}
