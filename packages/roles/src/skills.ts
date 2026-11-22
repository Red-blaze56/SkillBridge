// Every skill a role can ask for, with the words students use for it on a resume.
// Aliases are matched as whole words, case-insensitively.

export interface Skill {
  id: string;
  name: string;
  aliases: string[];
}

const skill = (id: string, name: string, aliases: string[]): Skill => ({ id, name, aliases });

export const SKILLS: Record<string, Skill> = Object.fromEntries(
  [
    // Languages
    skill('javascript', 'JavaScript', ['javascript', 'js', 'es6', 'ecmascript']),
    skill('typescript', 'TypeScript', ['typescript']),
    skill('python', 'Python', ['python', 'python3']),

    // Web
    skill('html-css', 'HTML & CSS', ['html', 'html5', 'css', 'css3', 'tailwind', 'tailwind css', 'bootstrap', 'sass', 'scss', 'responsive design', 'flexbox']),
    skill('react', 'React', ['react', 'react.js', 'reactjs', 'next.js', 'nextjs', 'jsx', 'react hooks']),
    skill('state-management', 'State management', ['redux', 'redux toolkit', 'zustand', 'mobx', 'context api', 'react query', 'tanstack query', 'recoil']),
    skill('accessibility', 'Accessibility', ['accessibility', 'a11y', 'aria', 'wcag', 'screen reader']),
    skill('web-performance', 'Web performance', ['web performance', 'lighthouse', 'lazy loading', 'code splitting', 'core web vitals']),

    // Back end
    skill('node', 'Node.js', ['node.js', 'nodejs', 'node', 'express', 'express.js', 'nestjs', 'koa', 'fastify']),
    skill('rest-apis', 'REST APIs', ['rest', 'rest api', 'rest apis', 'restful', 'api', 'apis', 'endpoints', 'fastapi', 'flask', 'django rest framework']),
    skill('auth', 'Authentication & security', ['authentication', 'authorization', 'jwt', 'oauth', 'bcrypt', 'passport.js', 'auth0', 'rbac', 'session management']),
    skill('sql', 'SQL databases', ['sql', 'mysql', 'postgresql', 'postgres', 'sqlite', 'sql server', 'mariadb', 'prisma', 'sequelize']),
    skill('mongodb', 'MongoDB / NoSQL', ['mongodb', 'mongo', 'mongoose', 'nosql', 'dynamodb', 'firestore']),
    skill('system-design', 'System design', ['system design', 'caching', 'redis', 'message queue', 'rabbitmq', 'kafka', 'microservices', 'load balancing', 'scalability']),

    // Engineering practice
    skill('git', 'Git', ['git', 'github', 'gitlab', 'bitbucket', 'version control']),
    skill('dsa', 'Data structures & algorithms', ['data structures', 'algorithms', 'dsa', 'leetcode', 'codeforces', 'codechef', 'competitive programming', 'hackerrank']),
    skill('testing', 'Testing', ['testing', 'unit testing', 'unit tests', 'jest', 'vitest', 'mocha', 'pytest', 'cypress', 'playwright', 'supertest', 'tdd']),
    skill('docker', 'Docker', ['docker', 'dockerfile', 'docker compose', 'containers', 'kubernetes', 'k8s']),
    skill('cloud', 'Cloud & deployment', ['aws', 'azure', 'gcp', 'google cloud', 'ec2', 's3', 'render', 'vercel', 'netlify', 'heroku', 'ci/cd', 'github actions', 'deployed']),

    // AI / ML
    skill('machine-learning', 'Machine learning', ['machine learning', 'ml', 'scikit-learn', 'sklearn', 'regression', 'classification', 'clustering', 'random forest', 'xgboost']),
    skill('deep-learning', 'Deep learning', ['deep learning', 'neural network', 'neural networks', 'tensorflow', 'keras', 'pytorch', 'cnn', 'rnn', 'lstm', 'transformers']),
    skill('data-handling', 'Data analysis', ['pandas', 'numpy', 'data analysis', 'data cleaning', 'matplotlib', 'seaborn', 'eda', 'data visualization']),
    skill('statistics', 'Statistics & maths', ['statistics', 'probability', 'linear algebra', 'calculus', 'hypothesis testing']),
    skill('llm-apps', 'LLM applications', ['llm', 'llms', 'large language models', 'rag', 'langchain', 'langgraph', 'prompt engineering', 'hugging face', 'embeddings', 'vector database']),
    skill('model-deployment', 'Model deployment', ['model deployment', 'mlops', 'streamlit', 'gradio', 'mlflow', 'onnx']),
  ].map((s) => [s.id, s]),
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const patterns = new Map<string, RegExp>();

/** True when the text names the skill or one of its aliases, as whole words. */
export function mentions(text: string, skill: Skill): boolean {
  let pattern = patterns.get(skill.id);
  if (!pattern) {
    const words = [skill.name.toLowerCase(), ...skill.aliases].map(escape).join('|');
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'iu');
    patterns.set(skill.id, pattern);
  }
  return pattern.test(text);
}
