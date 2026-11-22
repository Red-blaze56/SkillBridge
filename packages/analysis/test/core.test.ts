import { describe, expect, it } from 'vitest';
import type { Passage } from '@skillbridge/shared';
import { getRole, roleSkills, type Role } from '@skillbridge/roles';
import { checkEvidence, type Evidence } from '../src/evidence.ts';
import { buildResult, readiness } from '../src/score.ts';

const role = getRole('backend-developer')!;
const skills = new Map(roleSkills(role).map((s) => [s.id, s]));
const passages = new Map<number, Passage>(
  [
    { id: 4, section: 'skills' as const, page: 1, text: 'Languages: JavaScript, TypeScript, Python' },
    { id: 7, section: 'experience' as const, page: 1, text: 'Built REST APIs in Node.js and Express serving 12k requests a day' },
    { id: 10, section: 'projects' as const, page: 1, text: 'Designed a REST API with JWT login and MongoDB, used by 300 students' },
  ].map((p) => [p.id, p]),
);
const check = (skillId: string, level: number, passageId?: number, quote?: string) =>
  checkEvidence({ skillId, level, passageId, quote }, skills, passages);

describe('evidence checks', () => {
  it('accept a quote that is really in the cited passage', () => {
    const result = check('node', 3, 7, 'Built REST APIs in Node.js');
    expect(result).toMatchObject({ ok: true, evidence: { level: 3, passageId: 7, section: 'experience', note: null } });
  });

  it('match quotes regardless of case, spacing and curly punctuation', () => {
    expect(check('node', 3, 7, '  built rest APIs   in node.js ').ok).toBe(true);
  });

  it('lower the level to what the section can show', () => {
    const fromSkillsList = check('javascript', 3, 4, 'JavaScript');
    expect(fromSkillsList).toMatchObject({ ok: true, evidence: { level: 1 } });
    if (fromSkillsList.ok) expect(fromSkillsList.evidence.note).toMatch(/skills section/);
    expect(check('mongodb', 3, 10, 'MongoDB')).toMatchObject({ ok: true, evidence: { level: 2 } });
  });

  it('reject a quote that is not in the passage', () => {
    expect(check('docker', 3, 7, 'Deployed with Docker on AWS')).toMatchObject({ ok: false, message: expect.stringMatching(/isn't in passage #7/) });
  });

  it('reject a passage that does not exist, a missing quote, and an unknown skill', () => {
    expect(check('node', 2, 99, 'Node.js').ok).toBe(false);
    expect(check('node', 2, 7, '').ok).toBe(false);
    expect(check('kubernetes', 2, 7, 'Node.js').ok).toBe(false);
    expect(check('node', 4, 7, 'Node.js').ok).toBe(false);
  });

  it('record absence without a citation', () => {
    expect(check('docker', 0)).toMatchObject({ ok: true, evidence: { level: 0, passageId: null } });
  });
});

describe('readiness score', () => {
  const tiny: Role = {
    id: 'tiny',
    name: 'Tiny',
    version: '1.0.0',
    summary: '',
    skills: [
      { skill: 'node', weight: 3 },
      { skill: 'sql', weight: 2 },
      { skill: 'docker', weight: 1 },
    ],
  };

  it("follows the report's formula: 100 × Σ w·(level/3) / Σ w", () => {
    const levels = new Map([['node', 3], ['sql', 2], ['docker', 0]]);
    // 100 × (3·1 + 2·⅔ + 1·0) / 6 = 72.2
    expect(readiness(roleSkills(tiny), levels)).toBe(72.2);
    expect(readiness(roleSkills(tiny), new Map())).toBe(0);
    expect(readiness(roleSkills(tiny), new Map([['node', 3], ['sql', 3], ['docker', 3]]))).toBe(100);
  });

  it('builds the same result from the same evidence, with gaps most important first', () => {
    const evidence = new Map<string, Evidence>([
      ['node', { skillId: 'node', level: 3, passageId: 7, section: 'experience', quote: 'Node.js', note: null }],
      ['docker', { skillId: 'docker', level: 0, passageId: null, section: null, quote: null, note: null }],
    ]);
    const a = buildResult({ role: tiny, evidence, promptVersion: 'p1', model: 'm1' });
    const b = buildResult({ role: tiny, evidence, promptVersion: 'p1', model: 'm1' });
    expect(a).toEqual(b);
    expect(a.score).toBe(50);
    expect(a.gaps.map((g) => [g.skillId, g.level, g.target])).toEqual([
      ['sql', 0, 2],
      ['docker', 0, 1],
    ]);
    expect(a.skills.find((s) => s.skillId === 'node')).toMatchObject({ points: 50, evidence: { passageId: 7 } });
    expect(a).toMatchObject({ roleId: 'tiny', roleVersion: '1.0.0', formulaVersion: '1.0.0', promptVersion: 'p1', model: 'm1' });
  });
});
