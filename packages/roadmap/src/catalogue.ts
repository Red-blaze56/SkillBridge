// The curated, link-checked catalogue the roadmap picks from (report §3.7): free resources,
// each with a stable id. Plans refer to resources only by id, so a plan can never contain a
// made-up link. `pnpm --filter @skillbridge/roadmap check-links` re-checks every URL.

export interface Resource {
  /** Stable id, e.g. "mdn-js-guide". */
  id: string;
  skillId: string;
  title: string;
  provider: string;
  url: string;
  kind: 'docs' | 'course' | 'tutorial' | 'practice' | 'book';
  /** The level it gets a student to: 1 = enough to name it, 2 = enough to build with it. */
  level: 1 | 2;
  /** Rough time to work through it. */
  hours: number;
}

/** When check-links last passed for every URL below. */
export const CATALOGUE_CHECKED_AT = '2026-11-23';

const r = (id: string, skillId: string, title: string, provider: string, url: string, kind: Resource['kind'], level: 1 | 2, hours: number): Resource => ({
  id, skillId, title, provider, url, kind, level, hours,
});

export const RESOURCES: Resource[] = [
  // Languages
  r('mdn-js-guide', 'javascript', 'JavaScript Guide', 'MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', 'docs', 1, 8),
  r('javascript-info', 'javascript', 'The Modern JavaScript Tutorial', 'javascript.info', 'https://javascript.info/', 'tutorial', 2, 20),
  r('ts-handbook', 'typescript', 'The TypeScript Handbook', 'TypeScript', 'https://www.typescriptlang.org/docs/handbook/intro.html', 'docs', 2, 10),
  r('ts-in-5-minutes', 'typescript', 'TypeScript for JavaScript programmers', 'TypeScript', 'https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html', 'docs', 1, 1),
  r('python-tutorial', 'python', 'The Python Tutorial', 'Python.org', 'https://docs.python.org/3/tutorial/', 'docs', 1, 10),
  r('cs50-python', 'python', "CS50's Introduction to Programming with Python", 'Harvard CS50', 'https://cs50.harvard.edu/python/', 'course', 2, 30),

  // Web
  r('mdn-learn-web', 'html-css', 'Learn web development', 'MDN', 'https://developer.mozilla.org/en-US/docs/Learn_web_development', 'course', 1, 15),
  r('odin-foundations', 'html-css', 'Foundations course', 'The Odin Project', 'https://www.theodinproject.com/paths/foundations/courses/foundations', 'course', 2, 40),
  r('react-learn', 'react', 'Learn React', 'react.dev', 'https://react.dev/learn', 'docs', 1, 8),
  r('react-tutorial', 'react', 'Tutorial: Tic-Tac-Toe', 'react.dev', 'https://react.dev/learn/tutorial-tic-tac-toe', 'tutorial', 2, 4),
  r('react-managing-state', 'state-management', 'Managing state', 'react.dev', 'https://react.dev/learn/managing-state', 'docs', 1, 4),
  r('redux-essentials', 'state-management', 'Redux Essentials', 'Redux', 'https://redux.js.org/tutorials/essentials/part-1-overview-concepts', 'tutorial', 2, 8),
  r('wai-intro', 'accessibility', 'Introduction to web accessibility', 'W3C WAI', 'https://www.w3.org/WAI/fundamentals/accessibility-intro/', 'docs', 1, 1),
  r('web-dev-accessibility', 'accessibility', 'Learn Accessibility', 'web.dev', 'https://web.dev/learn/accessibility', 'course', 2, 6),
  r('web-dev-performance', 'web-performance', 'Learn Performance', 'web.dev', 'https://web.dev/learn/performance', 'course', 2, 6),
  r('lighthouse-overview', 'web-performance', 'Lighthouse overview', 'Chrome for Developers', 'https://developer.chrome.com/docs/lighthouse/overview', 'docs', 1, 1),

  // Back end
  r('nodejs-learn', 'node', 'Introduction to Node.js', 'Node.js', 'https://nodejs.org/learn/getting-started/introduction-to-nodejs', 'docs', 1, 3),
  r('express-starter', 'node', 'Getting started with Express', 'Express', 'https://expressjs.com/en/starter/hello-world/', 'tutorial', 2, 4),
  r('mdn-http-overview', 'rest-apis', 'An overview of HTTP', 'MDN', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview', 'docs', 1, 2),
  r('express-routing', 'rest-apis', 'Routing', 'Express', 'https://expressjs.com/en/guide/routing/', 'docs', 2, 3),
  r('fastapi-tutorial', 'rest-apis', 'Tutorial - User Guide', 'FastAPI', 'https://fastapi.tiangolo.com/tutorial/', 'tutorial', 2, 8),
  r('owasp-authentication', 'auth', 'Authentication Cheat Sheet', 'OWASP', 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html', 'docs', 1, 2),
  r('owasp-password-storage', 'auth', 'Password Storage Cheat Sheet', 'OWASP', 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html', 'docs', 2, 1),
  r('owasp-sessions', 'auth', 'Session Management Cheat Sheet', 'OWASP', 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html', 'docs', 2, 2),
  r('sqlbolt', 'sql', 'Interactive SQL lessons', 'SQLBolt', 'https://sqlbolt.com/', 'practice', 1, 4),
  r('postgres-tutorial', 'sql', 'The PostgreSQL tutorial', 'PostgreSQL', 'https://www.postgresql.org/docs/current/tutorial.html', 'docs', 2, 6),
  r('mongodb-crud', 'mongodb', 'MongoDB CRUD operations', 'MongoDB', 'https://www.mongodb.com/docs/manual/crud/', 'docs', 1, 3),
  r('mongodb-university', 'mongodb', 'MongoDB University', 'MongoDB', 'https://learn.mongodb.com/', 'course', 2, 10),
  r('redis-get-started', 'system-design', 'Get started with Redis (caching)', 'Redis', 'https://redis.io/docs/latest/develop/get-started/', 'docs', 1, 2),
  r('system-design-primer', 'system-design', 'The System Design Primer', 'GitHub (donnemartin)', 'https://github.com/donnemartin/system-design-primer', 'book', 2, 20),

  // Engineering practice
  r('pro-git', 'git', 'Pro Git (chapters 1–3)', 'git-scm.com', 'https://git-scm.com/book/en/v2', 'book', 1, 6),
  r('learn-git-branching', 'git', 'Learn Git Branching', 'learngitbranching.js.org', 'https://learngitbranching.js.org/', 'practice', 2, 4),
  r('github-hello-world', 'git', 'Hello World', 'GitHub Docs', 'https://docs.github.com/en/get-started/using-github/hello-world', 'tutorial', 1, 1),
  r('cses-book', 'dsa', "Competitive Programmer's Handbook", 'CSES', 'https://cses.fi/book/book.pdf', 'book', 1, 20),
  r('cses-problems', 'dsa', 'CSES Problem Set', 'CSES', 'https://cses.fi/problemset/', 'practice', 2, 30),
  r('cp-algorithms', 'dsa', 'Algorithms for Competitive Programming', 'cp-algorithms', 'https://cp-algorithms.com/', 'docs', 2, 10),
  r('vitest-guide', 'testing', 'Getting started', 'Vitest', 'https://vitest.dev/guide/', 'docs', 1, 2),
  r('jest-getting-started', 'testing', 'Getting started', 'Jest', 'https://jestjs.io/docs/getting-started', 'docs', 1, 2),
  r('pytest-getting-started', 'testing', 'Get started', 'pytest', 'https://docs.pytest.org/en/stable/getting-started.html', 'docs', 2, 3),
  r('docker-get-started', 'docker', 'Learn Docker', 'Docker Docs', 'https://docs.docker.com/learn/', 'tutorial', 1, 4),
  r('docker-compose-start', 'docker', 'Compose quickstart', 'Docker Docs', 'https://docs.docker.com/compose/gettingstarted/', 'tutorial', 2, 2),
  r('github-actions-quickstart', 'cloud', 'GitHub Actions quickstart', 'GitHub Docs', 'https://docs.github.com/en/actions/get-started/quickstart', 'tutorial', 1, 1),
  r('render-node-deploy', 'cloud', 'Deploy a Node Express app', 'Render', 'https://render.com/docs/deploy-node-express-app', 'tutorial', 2, 2),

  // AI / ML
  r('google-ml-crash-course', 'machine-learning', 'Machine Learning Crash Course', 'Google', 'https://developers.google.com/machine-learning/crash-course', 'course', 1, 15),
  r('kaggle-intro-ml', 'machine-learning', 'Intro to Machine Learning', 'Kaggle Learn', 'https://www.kaggle.com/learn/intro-to-machine-learning', 'course', 2, 3),
  r('sklearn-tutorial', 'machine-learning', 'Getting started', 'scikit-learn', 'https://scikit-learn.org/stable/getting_started.html', 'tutorial', 2, 2),
  r('fast-ai-course', 'deep-learning', 'Practical Deep Learning for Coders', 'fast.ai', 'https://course.fast.ai/', 'course', 2, 30),
  r('pytorch-basics', 'deep-learning', 'Learn the Basics', 'PyTorch', 'https://docs.pytorch.org/tutorials/beginner/basics/intro.html', 'tutorial', 1, 4),
  r('kaggle-pandas', 'data-handling', 'Pandas', 'Kaggle Learn', 'https://www.kaggle.com/learn/pandas', 'course', 1, 4),
  r('pandas-10-minutes', 'data-handling', '10 minutes to pandas', 'pandas', 'https://pandas.pydata.org/docs/user_guide/10min.html', 'docs', 1, 1),
  r('kaggle-data-viz', 'data-handling', 'Data Visualization', 'Kaggle Learn', 'https://www.kaggle.com/learn/data-visualization', 'course', 2, 4),
  r('khan-statistics', 'statistics', 'Statistics and probability', 'Khan Academy', 'https://www.khanacademy.org/math/statistics-probability', 'course', 2, 20),
  r('seeing-theory', 'statistics', 'Seeing Theory', 'Brown University', 'https://seeing-theory.brown.edu/', 'tutorial', 1, 3),
  r('hf-llm-course', 'llm-apps', 'LLM Course', 'Hugging Face', 'https://huggingface.co/learn/llm-course/chapter1/1', 'course', 2, 15),
  r('gemini-api-quickstart', 'llm-apps', 'Get started with the Gemini API', 'Google AI Studio', 'https://aistudio.google.com/docs/get-started', 'docs', 1, 1),
  r('streamlit-get-started', 'model-deployment', 'Get started', 'Streamlit', 'https://docs.streamlit.io/get-started', 'docs', 1, 2),
  r('gradio-quickstart', 'model-deployment', 'Quickstart', 'Gradio', 'https://gradio.app/guides/quickstart', 'docs', 2, 2),
];

/** A project per skill: the activity that turns study into resume evidence. */
export const PROJECTS: Record<string, string> = {
  javascript: 'Build a small browser game or quiz in plain JavaScript, with no framework.',
  typescript: 'Convert one of your JavaScript projects to TypeScript with strict mode on.',
  python: 'Write a command-line tool in Python that solves a real problem of yours, such as tidying files or tracking expenses.',
  'html-css': 'Build a responsive personal portfolio page from scratch with HTML and CSS.',
  react: 'Build a React app with routing and at least three screens, for example a recipe or notes app.',
  'state-management': 'Add shared state to a React app with Context or Redux Toolkit, such as a cart or a filter used on several screens.',
  accessibility: 'Audit one of your sites with Lighthouse and a screen reader, then fix every issue you find.',
  'web-performance': 'Measure a site with Lighthouse, then improve its score with lazy loading, code splitting and smaller images.',
  node: 'Build a REST API with Node.js and Express for a to-do or library app.',
  'rest-apis': 'Design and build a REST API with proper status codes, validation and error messages, and document its endpoints.',
  auth: 'Add sign-up and sign-in to an app: hashed passwords, sessions or JWTs, and protected routes.',
  sql: 'Design a relational schema for an app (students and courses, say), then write the queries it needs, including joins.',
  mongodb: 'Store an app’s data in MongoDB with Mongoose, with validation and at least one index.',
  'system-design': 'Add caching (for example Redis) or a message queue to one of your APIs, and write down why.',
  git: 'Keep a project on GitHub with clear commits, branches and at least one merged pull request.',
  dsa: 'Solve 50 problems across arrays, strings, hashing, recursion, trees and graphs, and keep your solutions in a repository.',
  testing: 'Write unit tests for one of your projects and run them on every push with GitHub Actions.',
  docker: 'Write a Dockerfile and a docker-compose file for one of your full-stack projects.',
  cloud: 'Deploy one of your projects so it has a public link, with automatic deploys from GitHub.',
  'machine-learning': 'Train and evaluate a model on a Kaggle dataset, comparing at least two algorithms with proper validation.',
  'deep-learning': 'Train a small image or text classifier in PyTorch and report its accuracy on held-out data.',
  'data-handling': 'Clean and explore a real dataset with pandas, and present three findings with charts.',
  statistics: 'Run an A/B-style analysis on a dataset: state a hypothesis, test it, and explain the result.',
  'llm-apps': 'Build a small LLM app, such as question answering over your own notes with retrieval.',
  'model-deployment': 'Put one of your models behind a Streamlit or Gradio app with a public link.',
};

/** Skills worth learning first, when both are gaps: foundations before what builds on them. */
export const PREREQUISITES: Record<string, string[]> = {
  typescript: ['javascript'],
  react: ['javascript', 'html-css'],
  'state-management': ['react'],
  accessibility: ['html-css'],
  'web-performance': ['html-css', 'javascript'],
  node: ['javascript'],
  auth: ['rest-apis'],
  'system-design': ['rest-apis'],
  'machine-learning': ['python', 'data-handling', 'statistics'],
  'deep-learning': ['machine-learning'],
  'data-handling': ['python'],
  'llm-apps': ['python'],
  'model-deployment': ['machine-learning'],
};
