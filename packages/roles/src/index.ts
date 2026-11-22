// The target roles a student can measure themselves against. Each skill has a weight:
// 3 = core, 2 = important, 1 = nice to have. Change a role → bump its version, so every
// stored analysis says exactly which requirements it was scored against.
import { SKILLS, type Skill } from './skills.ts';

export { mentions, SKILLS, type Skill } from './skills.ts';

export type Weight = 1 | 2 | 3;

export interface Role {
  id: string;
  name: string;
  version: string;
  summary: string;
  skills: { skill: string; weight: Weight }[];
}

export interface RoleSkill extends Skill {
  weight: Weight;
}

export const ROLES: Role[] = [
  {
    id: 'backend-developer',
    name: 'Backend Developer (fresher)',
    version: '1.0.0',
    summary: 'Builds and runs server-side APIs and the databases behind them.',
    skills: [
      { skill: 'javascript', weight: 3 },
      { skill: 'node', weight: 3 },
      { skill: 'rest-apis', weight: 3 },
      { skill: 'sql', weight: 2 },
      { skill: 'mongodb', weight: 2 },
      { skill: 'auth', weight: 2 },
      { skill: 'git', weight: 2 },
      { skill: 'dsa', weight: 2 },
      { skill: 'testing', weight: 1 },
      { skill: 'docker', weight: 1 },
      { skill: 'system-design', weight: 1 },
      { skill: 'cloud', weight: 1 },
    ],
  },
  {
    id: 'frontend-developer',
    name: 'Frontend Developer (fresher)',
    version: '1.0.0',
    summary: 'Builds the screens people use, in the browser.',
    skills: [
      { skill: 'javascript', weight: 3 },
      { skill: 'react', weight: 3 },
      { skill: 'html-css', weight: 3 },
      { skill: 'typescript', weight: 2 },
      { skill: 'state-management', weight: 2 },
      { skill: 'rest-apis', weight: 2 },
      { skill: 'git', weight: 2 },
      { skill: 'testing', weight: 1 },
      { skill: 'accessibility', weight: 1 },
      { skill: 'web-performance', weight: 1 },
      { skill: 'dsa', weight: 1 },
    ],
  },
  {
    id: 'full-stack-developer',
    name: 'Full Stack Developer (fresher)',
    version: '1.0.0',
    summary: 'Builds both the screens and the APIs behind them.',
    skills: [
      { skill: 'javascript', weight: 3 },
      { skill: 'react', weight: 3 },
      { skill: 'node', weight: 3 },
      { skill: 'rest-apis', weight: 3 },
      { skill: 'html-css', weight: 2 },
      { skill: 'mongodb', weight: 2 },
      { skill: 'sql', weight: 2 },
      { skill: 'auth', weight: 2 },
      { skill: 'git', weight: 2 },
      { skill: 'dsa', weight: 2 },
      { skill: 'docker', weight: 1 },
      { skill: 'testing', weight: 1 },
      { skill: 'cloud', weight: 1 },
    ],
  },
  {
    id: 'ai-ml-engineer',
    name: 'AI / ML Engineer (fresher)',
    version: '1.0.0',
    summary: 'Builds, evaluates and ships machine-learning and LLM features.',
    skills: [
      { skill: 'python', weight: 3 },
      { skill: 'machine-learning', weight: 3 },
      { skill: 'data-handling', weight: 3 },
      { skill: 'deep-learning', weight: 2 },
      { skill: 'statistics', weight: 2 },
      { skill: 'llm-apps', weight: 2 },
      { skill: 'sql', weight: 2 },
      { skill: 'git', weight: 2 },
      { skill: 'rest-apis', weight: 1 },
      { skill: 'model-deployment', weight: 1 },
      { skill: 'docker', weight: 1 },
      { skill: 'dsa', weight: 1 },
    ],
  },
];

export function getRole(id: string): Role | undefined {
  return ROLES.find((r) => r.id === id);
}

/** A role's skills with their details and weights. */
export function roleSkills(role: Role): RoleSkill[] {
  return role.skills.map(({ skill, weight }) => {
    const details = SKILLS[skill];
    if (!details) throw new Error(`Role ${role.id} asks for unknown skill ${skill}`);
    return { ...details, weight };
  });
}
