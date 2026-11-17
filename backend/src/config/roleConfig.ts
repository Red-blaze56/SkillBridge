import type { RoleSkill, TargetRole } from '../types/assessment.js'

const fullStackSkills: RoleSkill[] = [
  { name: 'JavaScript', category: 'Programming Languages', weight: 15, expectedLevel: 3, aliases: ['javascript', 'typescript', 'ecmascript'] },
  { name: 'React', category: 'Frontend', weight: 15, expectedLevel: 3, aliases: ['react', 'next.js', 'nextjs'] },
  { name: 'Node.js', category: 'Backend', weight: 15, expectedLevel: 3, aliases: ['node.js', 'nodejs', 'node'] },
  { name: 'Express.js', category: 'Backend', weight: 10, expectedLevel: 2, aliases: ['express.js', 'express'] },
  { name: 'MongoDB', category: 'Database', weight: 10, expectedLevel: 2, aliases: ['mongodb', 'mongo'] },
  { name: 'SQL', category: 'Database', weight: 10, expectedLevel: 2, aliases: ['sql', 'postgresql', 'mysql'] },
  { name: 'REST APIs', category: 'Backend', weight: 10, expectedLevel: 2, aliases: ['rest api', 'restful api', 'rest apis', 'api development'] },
  { name: 'Git', category: 'Tools', weight: 5, expectedLevel: 2, aliases: ['git', 'github', 'gitlab'] },
  { name: 'DSA', category: 'Core CS', weight: 5, expectedLevel: 2, aliases: ['dsa', 'data structures', 'algorithms', 'leetcode'] },
  { name: 'System Design', category: 'Core CS', weight: 5, expectedLevel: 2, aliases: ['system design', 'software architecture', 'microservices'] },
]

export const roleConfigurations: Record<TargetRole, { role: TargetRole; skills: RoleSkill[] }> = {
  'Full Stack Developer': { role: 'Full Stack Developer', skills: fullStackSkills },
  'Backend Developer': {
    role: 'Backend Developer',
    skills: [
      { name: 'Node.js', category: 'Backend', weight: 20, expectedLevel: 3, aliases: ['node.js', 'nodejs', 'node'] },
      { name: 'Express.js', category: 'Backend', weight: 15, expectedLevel: 2, aliases: ['express.js', 'express'] },
      { name: 'REST APIs', category: 'Backend', weight: 15, expectedLevel: 2, aliases: ['rest api', 'restful api', 'rest apis', 'api development'] },
      { name: 'MongoDB', category: 'Database', weight: 15, expectedLevel: 2, aliases: ['mongodb', 'mongo'] },
      { name: 'SQL', category: 'Database', weight: 10, expectedLevel: 2, aliases: ['sql', 'postgresql', 'mysql'] },
      { name: 'System Design', category: 'Core CS', weight: 10, expectedLevel: 2, aliases: ['system design', 'software architecture', 'microservices'] },
      { name: 'DSA', category: 'Core CS', weight: 10, expectedLevel: 2, aliases: ['dsa', 'data structures', 'algorithms', 'leetcode'] },
      { name: 'Git', category: 'Tools', weight: 5, expectedLevel: 2, aliases: ['git', 'github', 'gitlab'] },
    ],
  },
  'Frontend Developer': {
    role: 'Frontend Developer',
    skills: [
      { name: 'JavaScript', category: 'Programming Languages', weight: 20, expectedLevel: 3, aliases: ['javascript', 'typescript', 'ecmascript'] },
      { name: 'React', category: 'Frontend', weight: 25, expectedLevel: 3, aliases: ['react', 'next.js', 'nextjs'] },
      { name: 'HTML/CSS', category: 'Frontend', weight: 15, expectedLevel: 2, aliases: ['html', 'css', 'html/css', 'tailwind'] },
      { name: 'REST APIs', category: 'Backend', weight: 10, expectedLevel: 2, aliases: ['rest api', 'restful api', 'rest apis', 'api integration'] },
      { name: 'Git', category: 'Tools', weight: 10, expectedLevel: 2, aliases: ['git', 'github', 'gitlab'] },
      { name: 'Testing', category: 'Tools', weight: 10, expectedLevel: 2, aliases: ['testing', 'jest', 'vitest', 'cypress'] },
      { name: 'DSA', category: 'Core CS', weight: 10, expectedLevel: 2, aliases: ['dsa', 'data structures', 'algorithms', 'leetcode'] },
    ],
  },
  'AI Engineer': {
    role: 'AI Engineer',
    skills: [
      { name: 'Python', category: 'Programming Languages', weight: 20, expectedLevel: 3, aliases: ['python'] },
      { name: 'Machine Learning', category: 'AI/ML', weight: 20, expectedLevel: 2, aliases: ['machine learning', 'ml', 'scikit-learn', 'sklearn'] },
      { name: 'Deep Learning', category: 'AI/ML', weight: 15, expectedLevel: 2, aliases: ['deep learning', 'tensorflow', 'pytorch', 'keras'] },
      { name: 'SQL', category: 'Database', weight: 10, expectedLevel: 2, aliases: ['sql', 'postgresql', 'mysql'] },
      { name: 'REST APIs', category: 'Backend', weight: 10, expectedLevel: 2, aliases: ['rest api', 'restful api', 'rest apis', 'api development'] },
      { name: 'Git', category: 'Tools', weight: 10, expectedLevel: 2, aliases: ['git', 'github', 'gitlab'] },
      { name: 'DSA', category: 'Core CS', weight: 15, expectedLevel: 2, aliases: ['dsa', 'data structures', 'algorithms', 'leetcode'] },
    ],
  },
}

export const targetRoles = Object.keys(roleConfigurations) as TargetRole[]
