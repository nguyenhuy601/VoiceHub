/**
 * Mirror BE: services/user-service/src/constants/capabilityCatalog.js
 * Đồng bộ tay khi đổi whitelist server.
 * Position SoT = UserProfile.preferences.jobTitle (không dùng positionCode trên form).
 */

export const PRIMARY_DOMAINS = Object.freeze([
  'fe',
  'be',
  'fullstack',
  'mobile',
  'qa',
  'ba',
  'devops',
  'other',
]);

export const AVAILABILITY_VALUES = Object.freeze(['available', 'busy', 'partial']);

export const SKILL_WHITELIST = Object.freeze([
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

export const SKILL_LEVEL_MIN = 1;
export const SKILL_LEVEL_MAX = 5;
export const SUMMARY_MAX_LEN = 1000;
export const YEARS_EXPERIENCE_MAX = 40;
export const MAX_SKILLS = 20;
/** Hire SoT (Excel / mời KN) — JD-fit; profile vẫn MAX_SKILLS. */
export const HIRE_SKILLS_MAX = 10;

export const MAX_PROJECT_EXPERIENCES = 20;

export function emptyCapabilityForm() {
  return {
    primaryDomain: '',
    yearsExperience: '',
    skills: [],
    availability: 'available',
    summary: '',
    projectExperiences: [],
  };
}

export function projectExperiencesFromApi(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const name = String(p?.name || '').trim();
      const role = String(p?.role || '').trim();
      const work = String(p?.work || '').trim();
      if (!name && !role && !work) return null;
      const yearNum = Number(p?.year);
      return {
        name,
        role,
        work,
        year: Number.isFinite(yearNum) ? yearNum : null,
        source: String(p?.source || ''),
        status: String(p?.status || ''),
        evidenceBoardId: String(p?.evidenceBoardId || ''),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_PROJECT_EXPERIENCES);
}

export function capabilityFromApi(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    primaryDomain: String(c.primaryDomain || ''),
    yearsExperience:
      c.yearsExperience == null || c.yearsExperience === ''
        ? ''
        : String(c.yearsExperience),
    skills: Array.isArray(c.skills)
      ? c.skills
          .filter((s) => s?.name)
          .map((s) => ({
            name: String(s.name),
            level: Math.min(
              SKILL_LEVEL_MAX,
              Math.max(SKILL_LEVEL_MIN, Number(s.level) || 3)
            ),
          }))
          .slice(0, MAX_SKILLS)
      : [],
    availability: AVAILABILITY_VALUES.includes(c.availability)
      ? c.availability
      : 'available',
    summary: String(c.summary || '').slice(0, SUMMARY_MAX_LEN),
    verificationStatus: String(c.verificationStatus || 'draft'),
    rejectReason: String(c.rejectReason || ''),
    source: String(c.source || 'manual'),
    cvFileName: String(c.cvFileName || ''),
    cvFilePath: String(c.cvFilePath || ''),
    projectExperiences: projectExperiencesFromApi(c.projectExperiences),
  };
}

/** Position = jobTitle công ty (SoT); form chỉ kiểm domain/skills/years. */
export function canSubmitCapability(form, { jobTitle = '' } = {}) {
  if (!String(jobTitle || '').trim()) return false;
  if (!PRIMARY_DOMAINS.includes(form.primaryDomain)) return false;
  if (!Array.isArray(form.skills) || form.skills.length < 1) return false;
  const years = Number(form.yearsExperience);
  if (!Number.isFinite(years) || years < 0 || years > YEARS_EXPERIENCE_MAX) return false;
  return true;
}

export function toCapabilityPayload(form) {
  const years = Number(form.yearsExperience);
  return {
    primaryDomain: form.primaryDomain,
    yearsExperience: Number.isFinite(years) ? years : null,
    skills: (form.skills || []).slice(0, MAX_SKILLS),
    availability: form.availability || 'available',
    summary: String(form.summary || '').trim().slice(0, SUMMARY_MAX_LEN),
  };
}
