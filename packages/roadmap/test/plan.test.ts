import { describe, expect, it } from 'vitest';
import { ROLES, SKILLS } from '@skillbridge/roles';
import type { AnalysisResult } from '@skillbridge/shared';
import { buildRoadmap, PROJECTS, RESOURCES } from '../src/index.ts';

const gap = (skillId: string, weight: number, level: number, target: number) => ({ skillId, name: SKILLS[skillId]!.name, weight, level, target });

function result(gaps: ReturnType<typeof gap>[]): AnalysisResult {
  return { score: 40, skills: [], gaps, roleId: 'full-stack-developer', roleVersion: '1.0.0', formulaVersion: '1.0.0', promptVersion: 'p', model: 'm' };
}

describe('the catalogue', () => {
  it('has resources and a project for every skill any role needs', () => {
    for (const role of ROLES) {
      for (const { skill } of role.skills) {
        expect(RESOURCES.filter((r) => r.skillId === skill).length, skill).toBeGreaterThanOrEqual(2);
        // A nice-to-have's target is level 1, so every skill needs a beginner resource.
        expect(RESOURCES.some((r) => r.skillId === skill && r.level === 1), `${skill} level 1`).toBe(true);
        expect(PROJECTS[skill], skill).toBeTruthy();
      }
    }
  });

  it('uses unique ids and only https links to known skills', () => {
    expect(new Set(RESOURCES.map((r) => r.id)).size).toBe(RESOURCES.length);
    for (const r of RESOURCES) {
      expect(r.url, r.id).toMatch(/^https:\/\//);
      expect(SKILLS[r.skillId], r.id).toBeDefined();
    }
  });
});

describe('buildRoadmap', () => {
  it('turns each gap into a step with an objective, an activity, evidence of done and resources', () => {
    const plan = buildRoadmap('a1', result([gap('react', 3, 1, 2), gap('cloud', 1, 0, 1)]));
    expect(plan.steps.map((s) => s.skillId)).toEqual(['react', 'cloud']);
    const react = plan.steps[0]!;
    expect(react).toMatchObject({ from: 1, to: 2, hours: 14, activity: PROJECTS.react });
    expect(react.objective).toMatch(/project/);
    expect(react.doneWhen).toMatch(/link to the code/);
    expect(react.resources.length).toBeGreaterThan(0);
    for (const res of react.resources) expect(RESOURCES.some((r) => r.id === res.id && r.url === res.url)).toBe(true);
  });

  it('only suggests resources up to the target level, easiest first', () => {
    const plan = buildRoadmap('a1', result([gap('cloud', 1, 0, 1)]));
    expect(plan.steps[0]!.resources.map((r) => r.id)).toEqual(['github-actions-quickstart']);
  });

  it('puts a foundation before the skill that builds on it, otherwise keeps the gap order', () => {
    // The analysis lists react (core) first, but javascript is a gap too and react needs it.
    const plan = buildRoadmap('a1', result([gap('react', 3, 0, 2), gap('node', 3, 0, 2), gap('javascript', 3, 1, 2), gap('git', 2, 0, 2)]));
    expect(plan.steps.map((s) => s.skillId)).toEqual(['javascript', 'react', 'node', 'git']);
    expect(plan.steps[1]!.prerequisites).toEqual(['javascript']);
  });

  it('adds up the hours and the weeks at 8 hours a week', () => {
    const plan = buildRoadmap('a1', result([gap('react', 3, 0, 2), gap('docker', 1, 0, 1)]));
    // react: 2 levels × 14 h; docker: 1 level × 6 h
    expect(plan).toMatchObject({ totalHours: 34, weeks: 5, hoursPerWeek: 8, roleId: 'full-stack-developer', analysisId: 'a1' });
  });

  it('is empty when there are no gaps', () => {
    expect(buildRoadmap('a1', result([]))).toMatchObject({ steps: [], totalHours: 0, weeks: 0 });
  });
});
