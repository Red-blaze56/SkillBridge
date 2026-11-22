import { describe, expect, it } from 'vitest';
import { mentions, ROLES, roleSkills, SKILLS } from '../src/index.ts';

describe('roles', () => {
  it('have unique ids and only known skills, each listed once', () => {
    expect(new Set(ROLES.map((r) => r.id)).size).toBe(ROLES.length);
    for (const role of ROLES) {
      expect(() => roleSkills(role)).not.toThrow();
      const ids = role.skills.map((s) => s.skill);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('each have core skills and a semantic version', () => {
    for (const role of ROLES) {
      expect(role.skills.filter((s) => s.weight === 3).length).toBeGreaterThanOrEqual(2);
      expect(role.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe('mentions', () => {
  const node = SKILLS.node!;
  const restApis = SKILLS['rest-apis']!;

  it('finds a skill by name or alias, in any case', () => {
    expect(mentions('Built services in Node.js', node)).toBe(true);
    expect(mentions('Express routes for the shop', node)).toBe(true);
    expect(mentions('designed RESTful endpoints', restApis)).toBe(true);
  });

  it('matches whole words only', () => {
    expect(mentions('linked nodes in a graph', node)).toBe(false);
    expect(mentions('she expressed interest', node)).toBe(false);
    expect(mentions('rested well', restApis)).toBe(false);
  });

  it('handles aliases with punctuation', () => {
    expect(mentions('Set up CI/CD with GitHub Actions', SKILLS.cloud!)).toBe(true);
  });
});
