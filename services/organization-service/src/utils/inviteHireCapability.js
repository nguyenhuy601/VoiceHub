/**
 * KN hire optional lúc mời 1 người — cùng catalog Excel (domain / skill ≤10 / ≤5 DA / trần 1–20).
 * Không điền = null → accept chỉ structure (mã NV + chức danh), capability draft.
 */
const {
  normalizePrimaryDomain,
  normalizeSkillList,
  HIRE_SKILLS_MAX,
} = require('./resourceImportValidator');
const {
  PAST_PROJECT_MAX,
  validatePastProjectBlock,
} = require('./parsePastProjectBlocks');

const YEARS_EXPERIENCE_MAX = 40;

function truthyFlag(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function skillsToJoined(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((s) => (typeof s === 'string' ? s : s?.name))
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return String(raw || '').trim();
}

function hasAnyHireField(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (String(b.primaryDomain || '').trim()) return true;
  if (skillsToJoined(b.skills)) return true;
  if (b.yearsExperience != null && String(b.yearsExperience).trim() !== '') return true;
  if (b.maxConcurrentProjects != null && String(b.maxConcurrentProjects).trim() !== '') return true;
  const past = Array.isArray(b.pastProjects) ? b.pastProjects : [];
  return past.some((p) => p && (String(p.name || '').trim() || String(p.role || '').trim() || String(p.work || '').trim()));
}

/**
 * @returns {{ ok:true, value:null|object } | { ok:false, message:string, errorCode:string }}
 */
function parseOptionalHireCapability(body) {
  const b = body && typeof body === 'object' ? body : {};
  const include = truthyFlag(b.includeHireCapability) || hasAnyHireField(b);
  if (!include) {
    return { ok: true, value: null };
  }

  const domainParts = normalizePrimaryDomain(b.primaryDomain);
  if (!domainParts.ok) {
    return {
      ok: false,
      message:
        'Khi điền KN lúc mời: primaryDomain bắt buộc (Frontend|Backend|Full-stack|Mobile|QA|BA|DevOps|Other).',
      errorCode: 'VALIDATION_PRIMARY_DOMAIN_REQUIRED',
    };
  }

  const skillParts = normalizeSkillList(skillsToJoined(b.skills));
  if (!skillParts.ok || !skillParts.skills.length) {
    return {
      ok: false,
      message: skillParts.unknown
        ? `skills không có trong catalog: ${skillParts.unknown}`
        : 'Khi điền KN lúc mời: cần ≥1 kỹ năng đúng catalog (tab Năng lực).',
      errorCode: skillParts.unknown ? 'VALIDATION_SKILL_NOT_IN_CATALOG' : 'VALIDATION_SKILLS_REQUIRED',
    };
  }
  if (skillParts.skills.length > HIRE_SKILLS_MAX) {
    return {
      ok: false,
      message: `Khi mời: tối đa ${HIRE_SKILLS_MAX} kỹ năng JD-fit (HR chọn theo JD). Hiện: ${skillParts.skills.length}.`,
      errorCode: 'VALIDATION_SKILLS_HIRE_MAX',
    };
  }

  const yearsRaw = b.yearsExperience;
  const yearsExperience =
    yearsRaw == null || String(yearsRaw).trim() === '' ? null : Number(yearsRaw);
  if (
    yearsExperience == null ||
    !Number.isFinite(yearsExperience) ||
    yearsExperience < 0 ||
    yearsExperience > YEARS_EXPERIENCE_MAX
  ) {
    return {
      ok: false,
      message: `yearsExperience phải từ 0–${YEARS_EXPERIENCE_MAX}.`,
      errorCode: 'VALIDATION_YEARS_EXPERIENCE_INVALID',
    };
  }

  const maxRaw = b.maxConcurrentProjects;
  const maxStr = String(maxRaw ?? '').trim();
  const maxConcurrentProjects = maxStr ? Number(maxRaw) : 2;
  if (
    !Number.isFinite(maxConcurrentProjects) ||
    maxConcurrentProjects < 1 ||
    maxConcurrentProjects > 20
  ) {
    return {
      ok: false,
      message: 'maxConcurrentProjects phải nằm trong khoảng 1..20.',
      errorCode: 'VALIDATION_MAX_CONCURRENT_INVALID',
    };
  }

  const pastIn = Array.isArray(b.pastProjects) ? b.pastProjects : [];
  if (pastIn.length > PAST_PROJECT_MAX) {
    return {
      ok: false,
      message: `Tối đa ${PAST_PROJECT_MAX} dự án quá khứ (HR chọn theo JD).`,
      errorCode: 'VALIDATION_PAST_PROJECT_MAX',
    };
  }

  const pastProjects = [];
  for (let i = 0; i < pastIn.length; i += 1) {
    const p = pastIn[i] || {};
    const name = String(p.name || '').trim();
    const role = String(p.role || '').trim();
    const work = String(p.work || '').trim();
    const yearRaw = p.year != null && p.year !== '' ? p.year : p.yearRaw;
    if (!name && !role && !work && (yearRaw == null || String(yearRaw).trim() === '')) continue;
    const checked = validatePastProjectBlock({
      index: i + 1,
      name,
      role,
      work,
      yearRaw,
    });
    if (!checked.ok) {
      return { ok: false, message: checked.message, errorCode: checked.errorCode };
    }
    pastProjects.push(checked.value);
  }

  return {
    ok: true,
    value: {
      primaryDomain: domainParts.value,
      skills: skillParts.skills,
      yearsExperience: Math.floor(yearsExperience),
      maxConcurrentProjects: Math.floor(maxConcurrentProjects),
      pastProjects,
    },
  };
}

function hireCapabilityHasDomain(hire) {
  return Boolean(hire && typeof hire === 'object' && String(hire.primaryDomain || '').trim());
}

module.exports = {
  parseOptionalHireCapability,
  hireCapabilityHasDomain,
  YEARS_EXPERIENCE_MAX,
};
