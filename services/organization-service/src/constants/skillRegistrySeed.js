/**
 * Bootstrap catalog SE — seed ACTIVE skills per org (mirror user-service SKILL_WHITELIST).
 */
const SKILL_REGISTRY_SEED_NAMES = Object.freeze([
  'JavaScript',
  'TypeScript',
  'React',
  'Vue',
  'Node.js',
  'Express',
  'NestJS',
  'Java',
  'Spring',
  'Python',
  'Django',
  'Go',
  'C#',
  '.NET',
  'PHP',
  'Laravel',
  'MongoDB',
  'PostgreSQL',
  'MySQL',
  'SQL',
  'Redis',
  'Docker',
  'Kubernetes',
  'CI/CD',
  'Git',
  'REST API',
  'GraphQL',
  'WebSocket',
  'Selenium',
  'Playwright',
  'Jest',
  'Cypress',
  'Manual Testing',
  'API Testing',
  'Figma',
  'Agile/Scrum',
  'Jira',
  'Requirement Analysis',
  'System Design',
  'AWS',
  'Linux',
]);

/** Parent skill hints for matching (normalized child → parent normalizedName). */
const SKILL_PARENT_HINTS = Object.freeze({
  postgresql: 'sql',
  mysql: 'sql',
  express: 'node.js',
  nestjs: 'node.js',
  spring: 'java',
  django: 'python',
  laravel: 'php',
});

module.exports = {
  SKILL_REGISTRY_SEED_NAMES,
  SKILL_PARENT_HINTS,
};
