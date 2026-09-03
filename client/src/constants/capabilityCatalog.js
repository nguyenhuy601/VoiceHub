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
export const MAX_TOP_SKILLS = 5;
export const MAX_BUSINESS_DOMAINS = 3;

export const SENIORITY_BANDS = Object.freeze([
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
  'principal',
]);

export const PROFICIENCY_TIERS = Object.freeze(['beginner', 'proficient', 'expert']);

export const BUSINESS_DOMAIN_WHITELIST = Object.freeze([
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

export function proficiencyTierFromLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 'proficient';
  if (n <= 2) return 'beginner';
  if (n >= 4) return 'expert';
  return 'proficient';
}

/** Hire SoT (Excel / mời KN) — JD-fit; profile vẫn MAX_SKILLS. */
export const HIRE_SKILLS_MAX = 10;

export const MAX_PROJECT_EXPERIENCES = 20;

export function emptyCapabilityForm() {
  return {
    primaryDomain: '',
    seniorityBand: '',
    yearsExperience: '',
    skills: [],
    businessDomains: [],
    certifications: [],
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
          .map((s, idx) => ({
            name: String(s.name),
            skillId: String(s.skillId || s.skill_id || '').trim() || undefined,
            level: Math.min(
              SKILL_LEVEL_MAX,
              Math.max(SKILL_LEVEL_MIN, Number(s.level) || 3)
            ),
            rank: Number(s.rank) >= 1 ? Number(s.rank) : idx + 1,
            proficiencyTier: s.proficiencyTier || proficiencyTierFromLevel(s.level),
          }))
          .slice(0, MAX_TOP_SKILLS)
      : [],
    businessDomains: Array.isArray(c.businessDomains)
      ? c.businessDomains
          .filter((d) => d?.name)
          .map((d, idx) => ({
            name: String(d.name),
            rank: Number(d.rank) >= 1 ? Number(d.rank) : idx + 1,
          }))
          .slice(0, MAX_BUSINESS_DOMAINS)
      : [],
    certifications: Array.isArray(c.certifications)
      ? c.certifications.filter((cert) => cert?.name).map((cert) => ({ ...cert, name: String(cert.name) }))
      : [],
    seniorityBand: SENIORITY_BANDS.includes(c.seniorityBand) ? c.seniorityBand : '',
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
    skills: (form.skills || []).slice(0, MAX_TOP_SKILLS),
    businessDomains: (form.businessDomains || []).slice(0, MAX_BUSINESS_DOMAINS),
    certifications: (form.certifications || []).slice(0, 10),
    seniorityBand: SENIORITY_BANDS.includes(form.seniorityBand) ? form.seniorityBand : '',
    availability: form.availability || 'available',
    summary: String(form.summary || '').trim().slice(0, SUMMARY_MAX_LEN),
  };
}
