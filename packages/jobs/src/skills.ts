// What a posting asks for: which of SkillBridge's skills it names, and which target
// roles it fits. Done in code, so it is free, fast and the same every time.
import { ROLES, SKILLS, type Skill } from '@skillbridge/roles';
import type { Posting } from './boards.ts';

/**
 * Resume words that mean something else in a job ad: "the rest of the team", "render
 * the page", "regression testing", "express interest", or a company's own name.
 */
const AMBIGUOUS_IN_JOB_ADS = new Set([
  'rest', 'node', 'express', 'render', 'deployed', 'regression', 'classification', 'clustering',
  'containers', 'endpoints', 'hackerrank', 'vercel', 'gitlab',
]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const PATTERNS: [string, RegExp][] = Object.values(SKILLS).map((skill: Skill) => {
  const words = [skill.name.toLowerCase(), ...skill.aliases.filter((a) => !AMBIGUOUS_IN_JOB_ADS.has(a))]
    .map(escape)
    .join('|');
  return [skill.id, new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'iu')];
});

/** Ids of every skill the title or description names, in the skill list's order. */
export function skillsIn(p: Pick<Posting, 'title' | 'description'>): string[] {
  const text = `${p.title}\n${p.description}`;
  return PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

const ROLE_TITLES: [string, RegExp][] = [
  ['full-stack-developer', /\b(full[\s-]?stack|mern|mean)\b/i],
  ['frontend-developer', /\b(front[\s-]?end|react|ui (engineer|developer)|web developer)\b/i],
  ['backend-developer', /\b(back[\s-]?end|node(\.?js)?|django|api|platform|systems|cloud|devops|sre|site reliability|java|golang)\b/i],
  ['ai-ml-engineer', /\b(ai|ml|machine learning|data|llm|gen[\s-]?ai|nlp|computer vision|deep learning)\b/i],
];
const ML_SKILLS = new Set(['machine-learning', 'deep-learning', 'llm-apps', 'model-deployment']);
const SOFTWARE_ROLES = ['backend-developer', 'frontend-developer', 'full-stack-developer'];

/**
 * The target roles a posting suits. A specific title ("Backend Engineer") picks its
 * roles; a general one ("Software Engineer", "SDE Intern") suits every software role.
 * A posting that asks for ML skills also suits the AI/ML role.
 */
export function rolesFor(title: string, skills: readonly string[]): string[] {
  const roles = new Set(ROLE_TITLES.filter(([, pattern]) => pattern.test(title)).map(([id]) => id));
  if (roles.size === 0) for (const id of SOFTWARE_ROLES) roles.add(id);
  if (skills.some((s) => ML_SKILLS.has(s))) roles.add('ai-ml-engineer');
  return ROLES.map((r) => r.id).filter((id) => roles.has(id));
}
