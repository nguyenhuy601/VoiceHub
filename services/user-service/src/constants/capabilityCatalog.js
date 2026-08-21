/**
 * Catalog năng lực SE — MVP C1 (whitelist cứng).
 * Không free-text skill; CRUD Admin để pha sau.
 */

const POSITION_CODES = Object.freeze([
  'dev',
  'qa',
  'ba',
  'pm',
  'tl',
  'intern',
  'other',
]);

const PRIMARY_DOMAINS = Object.freeze([
  'fe',
  'be',
  'fullstack',
  'mobile',
  'qa',
  'ba',
  'devops',
  'other',
]);

const AVAILABILITY_VALUES = Object.freeze(['available', 'busy', 'partial']);

const VERIFICATION_STATUSES = Object.freeze([
  'draft',
  'pending_hr',
  'verified',
  'rejected',
]);

const CAPABILITY_ACTIONS = Object.freeze([
  'save_draft',
  'submit',
  'verify',
  'reject',
  'confirm_experience',
]);

/** Skill whitelist SE — name canonical (khớp không phân biệt hoa thường khi normalize). */
const SKILL_WHITELIST = Object.freeze([
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

const SKILL_LEVEL_MIN = 1;
const SKILL_LEVEL_MAX = 5;
const SUMMARY_MAX_LEN = 1000;
const YEARS_EXPERIENCE_MAX = 40;
const MAX_SKILLS = 20;
/** Top-N tech skills for AI matching (rank 1 = strongest). */
const MAX_TOP_SKILLS = 5;
const MAX_BUSINESS_DOMAINS = 3;
const MAX_CERTIFICATIONS = 10;

const SENIORITY_BANDS = Object.freeze([
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
  'principal',
]);

const PROFICIENCY_TIERS = Object.freeze(['beginner', 'proficient', 'expert']);

/** Business domain knowledge — tách khỏi tech skills (Payment, Banking, …). */
const BUSINESS_DOMAIN_WHITELIST = Object.freeze([
  'E-commerce',
  'Banking',
  'Payment',
  'Insurance',
  'Healthcare',
  'Logistics',
  'Education',
  'Telecom',
  'Manufacturing',
  'Government',
  'Real Estate',
  'Media',
  'Gaming',
  'ERP',
  'CRM',
  'Other',
]);

const skillAliasMap = (() => {
  const map = new Map();
  for (const name of SKILL_WHITELIST) {
    map.set(name.toLowerCase(), name);
  }
  // Alias thường gặp → canonical
  map.set('js', 'JavaScript');
  map.set('ts', 'TypeScript');
  map.set('nodejs', 'Node.js');
  map.set('node', 'Node.js');
  map.set('react.js', 'React');
  map.set('reactjs', 'React');
  map.set('vue.js', 'Vue');
  map.set('vuejs', 'Vue');
  map.set('mongo', 'MongoDB');
  map.set('postgres', 'PostgreSQL');
  map.set('k8s', 'Kubernetes');
  map.set('dotnet', '.NET');
  return map;
})();

function normalizeSkillName(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key) return null;
  return skillAliasMap.get(key) || null;
}

function isPositionCode(value) {
  return POSITION_CODES.includes(String(value || '').trim());
}

function isPrimaryDomain(value) {
  return PRIMARY_DOMAINS.includes(String(value || '').trim());
}

function isAvailability(value) {
  return AVAILABILITY_VALUES.includes(String(value || '').trim());
}

function isVerificationStatus(value) {
  return VERIFICATION_STATUSES.includes(String(value || '').trim());
}

const businessDomainAliasMap = (() => {
  const map = new Map();
  for (const name of BUSINESS_DOMAIN_WHITELIST) {
    map.set(name.toLowerCase(), name);
  }
  map.set('ecommerce', 'E-commerce');
  map.set('e-commerce', 'E-commerce');
  map.set('fintech', 'Payment');
  map.set('finance', 'Banking');
  return map;
})();

function normalizeBusinessDomainName(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key) return null;
  return businessDomainAliasMap.get(key) || null;
}

function isSeniorityBand(value) {
  return SENIORITY_BANDS.includes(String(value || '').trim());
}

function proficiencyTierFromLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 'proficient';
  if (n <= 2) return 'beginner';
  if (n >= 4) return 'expert';
  return 'proficient';
}

function levelFromProficiencyTier(tier) {
  const t = String(tier || '').trim().toLowerCase();
  if (t === 'beginner') return 2;
  if (t === 'expert') return 5;
  return 3;
}

/** HR suggestion — không auto-ghi; chỉ gợi ý khi chưa có seniorityBand. */
function suggestSeniorityFromYears(years) {
  const y = Number(years);
  if (!Number.isFinite(y) || y < 0) return null;
  if (y < 1) return 'intern';
  if (y < 2) return 'junior';
  if (y < 5) return 'mid';
  if (y < 8) return 'senior';
  return 'lead';
}

module.exports = {
  POSITION_CODES,
  PRIMARY_DOMAINS,
  AVAILABILITY_VALUES,
  VERIFICATION_STATUSES,
  CAPABILITY_ACTIONS,
  SKILL_WHITELIST,
  BUSINESS_DOMAIN_WHITELIST,
  SENIORITY_BANDS,
  PROFICIENCY_TIERS,
  SKILL_LEVEL_MIN,
  SKILL_LEVEL_MAX,
  SUMMARY_MAX_LEN,
  YEARS_EXPERIENCE_MAX,
  MAX_SKILLS,
  MAX_TOP_SKILLS,
  MAX_BUSINESS_DOMAINS,
  MAX_CERTIFICATIONS,
  normalizeSkillName,
  normalizeBusinessDomainName,
  isPositionCode,
  isPrimaryDomain,
  isAvailability,
  isVerificationStatus,
  isSeniorityBand,
  proficiencyTierFromLevel,
  levelFromProficiencyTier,
  suggestSeniorityFromYears,
};
