import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '@skillbridge/shared';
import type { Posting } from '../src/boards.ts';
import { experience } from '../src/experience.ts';
import { dropReason, fingerprint, isRemote } from '../src/filters.ts';
import { compareMatches, matchPosting, rankValue } from '../src/match.ts';
import { rolesFor, skillsIn } from '../src/skills.ts';

const NOW = new Date('2026-11-23T00:00:00Z');
const job = (fields: Partial<Posting>): Posting => ({
  id: 'greenhouse:acme:1',
  ats: 'greenhouse',
  slug: 'acme',
  company: 'Acme',
  title: 'Software Engineer',
  location: 'Bengaluru, India',
  url: 'https://x',
  description: 'Build APIs in Node.js.',
  postedAt: '2026-11-20',
  ...fields,
});

describe('experience', () => {
  it('reads ranges, "N+" and bare years next to the word experience', () => {
    expect(experience('Engineer', 'You have 3+ years building backend systems.')).toBe('3+');
    expect(experience('Engineer', 'Requirements: 2-5 years backend experience')).toBe('2-5');
    expect(experience('Engineer', '0-0 Yrs')).toBe('0');
    expect(experience('Engineer', 'Minimum 2 years of experience in Java')).toBe('2');
  });

  it('ignores a company’s age, and treats fresher words as 0', () => {
    expect(experience('Engineer', 'We have been building for 10 years.')).toBeNull();
    expect(experience('SDE Intern', 'Join us.')).toBe('0');
    expect(experience('Engineer', 'Open to new grads.')).toBe('0');
  });
});

describe('dropReason', () => {
  it('keeps a fresher-friendly developer job in India or remote', () => {
    expect(dropReason(job({}), NOW)).toBeNull();
    expect(dropReason(job({ title: 'Software Development Engineer', location: 'Remote' }), NOW)).toBeNull();
    expect(dropReason(job({ title: 'SDE Intern', description: 'Ideally 3+ years of experience.' }), NOW)).toBeNull(); // "Intern" wins
  });

  it('drops the wrong title, place, seniority or age', () => {
    expect(dropReason(job({ title: 'Staff Software Engineer' }), NOW)).toBe('title');
    expect(dropReason(job({ title: 'Software Engineer II' }), NOW)).toBe('title');
    expect(dropReason(job({ title: 'Enterprise Account Executive' }), NOW)).toBe('title');
    expect(dropReason(job({ location: 'San Francisco, CA' }), NOW)).toBe('location');
    expect(dropReason(job({ location: 'Indianapolis, Indiana' }), NOW)).toBe('location'); // whole words only
    expect(dropReason(job({ location: 'Remote - Europe' }), NOW)).toBe('location'); // remote, but not open to India
    expect(dropReason(job({ description: '2-5 years backend experience' }), NOW)).toBe('experience');
    expect(dropReason(job({ postedAt: '2026-01-01' }), NOW)).toBe('age');
  });
});

describe('isRemote', () => {
  it('counts remote jobs a student in India can take', () => {
    for (const location of ['Remote', 'Fully remote', 'Remote (India)', 'Remote - APAC', 'Anywhere', 'Worldwide, Remote', 'Remote / Remote', 'Remote-first, hybrid OK']) {
      expect(isRemote({ location }), location).toBe(true);
    }
  });

  it('not remote jobs tied to another country, or not remote at all', () => {
    for (const location of ['Remote, US', 'Remote Canada', 'San Francisco, Remote', 'Remote - Europe', 'Bengaluru', 'Distributed team']) {
      expect(isRemote({ location }), location).toBe(false);
    }
  });
});

describe('fingerprint', () => {
  it('treats the same company and title as one job', () => {
    expect(fingerprint('WeIntern Pvt Ltd', 'Full-Stack Developer')).toBe(fingerprint('weintern', 'Fullstack developer'));
    expect(fingerprint('Electronic Arts (EA)', 'SDE')).toBe(fingerprint('Electronic Arts', 'SDE'));
  });
});

describe('skillsIn', () => {
  it('finds the skills a posting names, as whole words', () => {
    expect(skillsIn({ title: 'Frontend Engineer', description: 'Build UI in React and TypeScript with Jest tests.' })).toEqual([
      'typescript',
      'react',
      'testing',
    ]);
  });

  it('ignores resume words that mean something else in a job ad', () => {
    const skills = skillsIn({ title: 'QA Engineer', description: 'Work with the rest of the team on regression testing. Express interest by applying.' });
    expect(skills).toEqual(['testing']);
  });
});

describe('rolesFor', () => {
  it('maps titles to target roles', () => {
    expect(rolesFor('Backend Engineer', [])).toEqual(['backend-developer']);
    expect(rolesFor('Full Stack Developer (MERN)', [])).toEqual(['full-stack-developer']);
    expect(rolesFor('Software Engineer', [])).toEqual(['backend-developer', 'frontend-developer', 'full-stack-developer']);
    expect(rolesFor('ML Engineer Intern', [])).toEqual(['ai-ml-engineer']);
    expect(rolesFor('Software Engineer', ['deep-learning'])).toContain('ai-ml-engineer');
  });
});

describe('matchPosting', () => {
  const analysis: Pick<AnalysisResult, 'skills'> = {
    skills: [
      { skillId: 'node', name: 'Node.js', weight: 3, level: 3, evidence: null, note: null, points: 0 },
      { skillId: 'javascript', name: 'JavaScript', weight: 3, level: 1, evidence: null, note: null, points: 0 },
      { skillId: 'sql', name: 'SQL databases', weight: 2, level: 0, evidence: null, note: null, points: 0 },
      { skillId: 'docker', name: 'Docker', weight: 1, level: 2, evidence: null, note: null, points: 0 },
    ],
  };

  it('scores what the posting asks for against the analysis, and explains it', () => {
    const match = matchPosting(['javascript', 'node', 'sql', 'docker', 'react'], analysis);
    // node 3×1 + javascript 3×½ + sql 2×0 + docker 1×1 out of 9
    expect(match.score).toBe(Math.round((100 * (3 + 1.5 + 0 + 1)) / 9));
    expect(match.strong.map((s) => s.skillId)).toEqual(['node', 'docker']);
    expect(match.weak.map((s) => s.skillId)).toEqual(['javascript']);
    expect(match.missing.map((s) => s.skillId)).toEqual(['sql']);
    expect(match.unchecked).toEqual(['react']); // not part of the analysed role
  });

  it('has no score when the posting names none of the analysed skills', () => {
    expect(matchPosting(['react'], analysis).score).toBeNull();
    expect(matchPosting([], analysis).score).toBeNull();
  });
});

describe('ranking', () => {
  const analysis: Pick<AnalysisResult, 'skills'> = {
    skills: ['node', 'javascript', 'sql', 'docker', 'git'].map((skillId, i) => ({
      skillId,
      name: skillId,
      weight: 2,
      level: i < 4 ? 2 : 0,
      evidence: null,
      note: null,
      points: 0,
    })),
  };
  const entry = (skills: string[], postedAt = new Date('2026-11-20')) => ({ match: matchPosting(skills, analysis), postedAt });

  it('scales a score by how many checked skills the posting names, up to three', () => {
    expect(rankValue(matchPosting(['node'], analysis))).toBeCloseTo(100 / 3);
    expect(rankValue(matchPosting(['node', 'javascript', 'sql'], analysis))).toBe(100);
    expect(rankValue(matchPosting(['react'], analysis))).toBe(-1);
  });

  it('puts a four-skill 80 above a one-skill 100, and null scores last', () => {
    const one = entry(['node']); // 100, one skill
    const four = entry(['node', 'javascript', 'sql', 'docker', 'git']); // 80, five skills
    const none = entry(['react']);
    expect([one, none, four].sort(compareMatches)).toEqual([four, one, none]);
    expect(four.match.score).toBe(80);
  });

  it('breaks ties by skills shown, then by the newest posting', () => {
    const older = entry(['node', 'javascript', 'sql'], new Date('2026-11-01'));
    const newer = entry(['node', 'javascript', 'sql'], new Date('2026-11-21'));
    expect([older, newer].sort(compareMatches)).toEqual([newer, older]);
  });
});
