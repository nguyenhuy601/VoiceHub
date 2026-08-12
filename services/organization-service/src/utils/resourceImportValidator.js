/**
 * Lightweight normalizeRole mirror (avoid importing mongoose model in unit tests).
 * Membership.normalizeRole mapping:
 * owner|admin|hr|human_resources|nhan_su -> hr
 * member|org_admin|department_head|team_leader|employee -> member (or admin for org_admin)
 */
const {
  parsePastProjectBlocks,
  validatePastProjectBlock,
} = require('./parsePastProjectBlocks');

function normalizeRole(role) {
  const roleMap = {
    owner: 'owner',
    admin: 'admin',
    hr: 'hr',
    human_resources: 'hr',
    nhan_su: 'hr',
    member: 'member',
    org_admin: 'admin',
    department_head: 'member',
    team_leader: 'member',
    employee: 'member',
  };
  return roleMap[String(role || '').trim().toLowerCase()] || 'member';
}

function toLowerTrim(s) {
  return String(s || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  // simple but good enough for Excel import
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function splitSkills(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .split(/[;,]/g)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

/** Mirror user-service capabilityCatalog — không require mongoose. */
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

const skillAliasMap = (() => {
  const map = new Map();
  for (const name of SKILL_WHITELIST) {
    map.set(name.toLowerCase(), name);
  }
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

/** Hire SoT (Excel / invite KN) — JD-fit; profile user-service vẫn MAX_SKILLS=20. */
const HIRE_SKILLS_MAX = 10;

/**
 * Catalog + dedupe. Không cắt thầm — caller hire kiểm HIRE_SKILLS_MAX.
 * @returns {{ ok:true, skills:string[] } | { ok:false, unknown:string }}
 */
function normalizeSkillList(raw) {
  const tokens = splitSkills(raw);
  if (!tokens.length) return { ok: false, skills: [], unknown: '' };
  const out = [];
  const seen = new Set();
  for (const token of tokens) {
    const name = normalizeSkillName(token);
    if (!name) return { ok: false, skills: [], unknown: token };
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  if (!out.length) return { ok: false, skills: [], unknown: '' };
  return { ok: true, skills: out };
}

/**
 * Tách fullName VN: từ cuối = tên (firstName), phần còn lại = họ+đệm (lastName).
 * "Đỗ Công Danh" → { firstName: "Danh", lastName: "Đỗ Công", displayName: "Đỗ Công Danh" }
 */
function splitFullName(raw) {
  const full = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
  if (!full) {
    return { ok: false, firstName: '', lastName: '', displayName: '' };
  }
  // Chặn chuỗi chỉ số / ký tự đặc biệt thô
  if (!/[\p{L}]/u.test(full) || /^\d+$/.test(full)) {
    return { ok: false, firstName: '', lastName: '', displayName: '' };
  }
  const parts = full.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return {
      ok: true,
      firstName: parts[0],
      lastName: parts[0],
      displayName: full,
    };
  }
  const firstName = parts[parts.length - 1];
  const lastName = parts.slice(0, -1).join(' ');
  return { ok: true, firstName, lastName, displayName: full };
}

/** Mirror capabilityCatalog PRIMARY_DOMAINS (user-service). */
const PRIMARY_DOMAINS = new Set([
  'fe',
  'be',
  'fullstack',
  'mobile',
  'qa',
  'ba',
  'devops',
  'other',
]);

/** Nhãn dropdown Excel = đúng UI Năng lực (DB vẫn lưu fe|be|…). */
const PRIMARY_DOMAIN_LABELS = Object.freeze([
  'Frontend',
  'Backend',
  'Full-stack',
  'Mobile',
  'QA',
  'BA',
  'DevOps',
  'Other',
]);

const PRIMARY_DOMAIN_ALIASES = {
  frontend: 'fe',
  'front-end': 'fe',
  front: 'fe',
  backend: 'be',
  'back-end': 'be',
  back: 'be',
  full: 'fullstack',
  'full-stack': 'fullstack',
  'full stack': 'fullstack',
  ios: 'mobile',
  android: 'mobile',
  tester: 'qa',
  test: 'qa',
  'business analyst': 'ba',
  analyst: 'ba',
  sre: 'devops',
  other: 'other',
  khác: 'other',
  khac: 'other',
};

/**
 * Normalize primaryDomain Excel cell → catalog code.
 * @returns {{ ok:true, value:string } | { ok:false }}
 */
function normalizePrimaryDomain(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return { ok: false, value: '' };
  if (PRIMARY_DOMAINS.has(s)) return { ok: true, value: s };
  const alias = PRIMARY_DOMAIN_ALIASES[s];
  if (alias && PRIMARY_DOMAINS.has(alias)) return { ok: true, value: alias };
  return { ok: false, value: '' };
}

/**
 * Phone optional. Nếu có thì chuẩn hóa số VN về dạng 0XXXXXXXXX.
 * @returns {{ ok:true, phone:string|null } | { ok:false }}
 */
function normalizeOptionalPhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, phone: null };

  // Giữ digits; cho phép +84 / 84 / 0xxxxxxxxxx
  let digits = s.replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  digits = digits.replace(/\D/g, '');

  // VN mobile: 10 số, bắt đầu bằng 0
  if (!/^0\d{9}$/.test(digits)) {
    return { ok: false, phone: null };
  }
  return { ok: true, phone: digits };
}

/**
 * Mã nhân viên — convention VH-001 (cùng mời tay). Để trống = auto-allocate sau validate.
 * @returns {{ ok:true, value:string|null, empty?:boolean } | { ok:false, value:null }}
 */
function normalizeEmployeeCode(raw, options = {}) {
  const { canonicalizeEmployeeCode } = require('./employeeCodePolicy');
  return canonicalizeEmployeeCode(raw, { allowEmpty: Boolean(options.allowEmpty) });
}

/**
 * Pure validator cho Excel rows (strict rejection).
 * @param {Array<{rowNumber:number, employeeCode?:string, fullName?:any, email:any, phone?:any, departmentCode:any, jobTitle:any, primaryDomain?:any, skills:any, yearsExperience:any, maxConcurrentProjects:any, orgRole:any}>} rows
 * @param {{ allowedEmailDomains?: string[], allowEmptyEmployeeCode?: boolean }} [options]
 * @returns {{ ok:true, normalizedRows:Array } | { ok:false, errorCode:string, details:Array } }
 */
function validateResourceImportRows(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      errorCode: 'VALIDATION_REQUIRED',
      details: [{ rowNumber: 0, message: 'Excel không có dòng dữ liệu.' }],
    };
  }

  const { assertEmailDomainAllowed } = require('./emailDomainPolicy');
  const allowedEmailDomains = options.allowedEmailDomains;
  const allowEmptyEmployeeCode = options.allowEmptyEmployeeCode !== false;

  const emailSeen = new Set();
  const employeeCodeSeen = new Set();
  const normalizedRows = [];
  const details = [];

  for (const r of rows) {
    const rowNumber = Number(r.rowNumber || 0);
    const email = String(r.email || '').trim().toLowerCase();
    const departmentCode = String(r.departmentCode || '').trim();
    const jobTitle = String(r.jobTitle || '').trim();
    const codeParts = normalizeEmployeeCode(r.employeeCode, { allowEmpty: allowEmptyEmployeeCode });
    const nameParts = splitFullName(r.fullName);
    const phoneParts = normalizeOptionalPhone(r.phone);
    const domainParts = normalizePrimaryDomain(r.primaryDomain);
    const skillParts = normalizeSkillList(r.skills);
    const yearsExperienceRaw = r.yearsExperience;
    const yearsExperience =
      yearsExperienceRaw == null || yearsExperienceRaw === ''
        ? null
        : Number(yearsExperienceRaw);
    const maxConcurrentProjectsRaw = r.maxConcurrentProjects;
    const maxConcurrentProjectsRawStr = String(maxConcurrentProjectsRaw ?? '').trim();
    const maxConcurrentProjects = maxConcurrentProjectsRawStr
      ? Number(maxConcurrentProjectsRaw)
      : 2;
    const orgRoleRaw = String(r.orgRole ?? '').trim();
    const orgRoleLower = orgRoleRaw ? orgRoleRaw.toLowerCase() : 'employ';

    // Security: block owner escalation by keyword.
    if (orgRoleLower.includes('owner')) {
      details.push({
        rowNumber,
        message: "Không được phép gán vai trò chứa 'owner' qua Excel.",
        errorCode: 'SECURITY_VIOLATION_ERROR',
      });
      continue;
    }

    if (!codeParts.ok) {
      details.push({
        rowNumber,
        message:
          codeParts.message ||
          'employeeCode phải dạng VH-001 (cùng mã mời tay), hoặc để trống để hệ thống tự cấp.',
        errorCode: codeParts.errorCode || 'VALIDATION_EMPLOYEE_CODE_FORMAT',
      });
      continue;
    }

    if (codeParts.value && employeeCodeSeen.has(codeParts.value)) {
      details.push({
        rowNumber,
        message: 'employeeCode bị trùng trong cùng file.',
        errorCode: 'VALIDATION_EMPLOYEE_CODE_DUPLICATE',
      });
      continue;
    }

    if (!nameParts.ok || !nameParts.displayName) {
      details.push({
        rowNumber,
        message: 'fullName (họ tên) bắt buộc.',
        errorCode: 'VALIDATION_FULL_NAME_REQUIRED',
      });
      continue;
    }

    if (!email || !isValidEmail(email)) {
      details.push({
        rowNumber,
        message: 'Email không hợp lệ hoặc trống.',
        errorCode: 'VALIDATION_EMAIL_INVALID',
      });
      continue;
    }

    const domainGate = assertEmailDomainAllowed(email, allowedEmailDomains);
    if (!domainGate.ok) {
      details.push({
        rowNumber,
        message: domainGate.message,
        errorCode: domainGate.errorCode || 'VALIDATION_EMAIL_DOMAIN',
      });
      continue;
    }

    if (emailSeen.has(email)) {
      details.push({
        rowNumber,
        message: 'Email bị trùng trong cùng file.',
        errorCode: 'VALIDATION_EMAIL_DUPLICATE',
      });
      continue;
    }

    if (!phoneParts.ok) {
      details.push({
        rowNumber,
        message: 'phone không hợp lệ (để trống hoặc 10 số VN, ví dụ 09xxxxxxxx / +84…).',
        errorCode: 'VALIDATION_PHONE_INVALID',
      });
      continue;
    }

    if (!jobTitle) {
      details.push({
        rowNumber,
        message: 'jobTitle (chức danh) bắt buộc.',
        errorCode: 'VALIDATION_JOB_TITLE_REQUIRED',
      });
      continue;
    }

    if (!departmentCode) {
      details.push({
        rowNumber,
        message: 'departmentCode bắt buộc.',
        errorCode: 'VALIDATION_DEPARTMENT_REQUIRED',
      });
      continue;
    }

    if (!domainParts.ok) {
      details.push({
        rowNumber,
        message:
          'primaryDomain bắt buộc (Frontend|Backend|Full-stack|Mobile|QA|BA|DevOps|Other, hoặc fe|be|…).',
        errorCode: 'VALIDATION_PRIMARY_DOMAIN_REQUIRED',
      });
      continue;
    }

    if (!skillParts.ok || !skillParts.skills.length) {
      details.push({
        rowNumber,
        message: skillParts.unknown
          ? `skills không có trong catalog (giống tab Năng lực): ${skillParts.unknown}`
          : 'skills bắt buộc (tên đúng lists!E, tách bởi dấu , hoặc ;).',
        errorCode: skillParts.unknown ? 'VALIDATION_SKILL_NOT_IN_CATALOG' : 'VALIDATION_SKILLS_REQUIRED',
      });
      continue;
    }
    if (skillParts.skills.length > HIRE_SKILLS_MAX) {
      details.push({
        rowNumber,
        message: `Hire Excel tối đa ${HIRE_SKILLS_MAX} kỹ năng JD-fit (HR chọn theo JD). Profile sau vẫn tới 20. Hiện: ${skillParts.skills.length}.`,
        errorCode: 'VALIDATION_SKILLS_HIRE_MAX',
      });
      continue;
    }
    const skills = skillParts.skills;

    if (yearsExperience == null || !Number.isFinite(yearsExperience) || yearsExperience < 0) {
      details.push({
        rowNumber,
        message: 'yearsExperience không hợp lệ.',
        errorCode: 'VALIDATION_YEARS_EXPERIENCE_INVALID',
      });
      continue;
    }

    if (!Number.isFinite(maxConcurrentProjects) || maxConcurrentProjects < 1 || maxConcurrentProjects > 20) {
      details.push({
        rowNumber,
        message: 'maxConcurrentProjects phải nằm trong khoảng 1..20.',
        errorCode: 'VALIDATION_MAX_CONCURRENT_INVALID',
      });
      continue;
    }

    const pastBlocks = parsePastProjectBlocks(r);
    const pastProjects = [];
    let pastProjectFailed = false;
    for (const block of pastBlocks) {
      const checked = validatePastProjectBlock(block);
      if (!checked.ok) {
        details.push({
          rowNumber,
          message: checked.message,
          errorCode: checked.errorCode,
        });
        pastProjectFailed = true;
        break;
      }
      pastProjects.push(checked.value);
    }
    if (pastProjectFailed) continue;

    // orgRole: blank -> employ => store as member
    const mappedRole = orgRoleLower === 'employ' ? 'member' : orgRoleLower;
    const normalizedRole = normalizeRole(mappedRole);
    if (normalizedRole === 'owner') {
      details.push({
        rowNumber,
        message: "Vai trò owner bị cấm.",
        errorCode: 'SECURITY_VIOLATION_ERROR',
      });
      continue;
    }

    emailSeen.add(email);
    if (codeParts.value) employeeCodeSeen.add(codeParts.value);
    normalizedRows.push({
      rowNumber,
      employeeCode: codeParts.value,
      needsEmployeeCodeAllocate: Boolean(codeParts.empty),
      fullName: nameParts.displayName,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      displayName: nameParts.displayName,
      email,
      phone: phoneParts.phone,
      departmentCode,
      jobTitle,
      primaryDomain: domainParts.value,
      skills,
      yearsExperience: Math.floor(yearsExperience),
      maxConcurrentProjects: Math.floor(maxConcurrentProjects),
      orgRole: normalizedRole,
      pastProjects,
    });
  }

  if (details.length) {
    const hasSecurity = details.some((d) => d.errorCode === 'SECURITY_VIOLATION_ERROR');
    return {
      ok: false,
      errorCode: hasSecurity ? 'SECURITY_VIOLATION_ERROR' : 'VALIDATION_ERROR',
      details,
    };
  }

  return { ok: true, normalizedRows };
}

module.exports = {
  validateResourceImportRows,
  splitFullName,
  normalizeOptionalPhone,
  normalizePrimaryDomain,
  normalizeSkillName,
  normalizeSkillList,
  normalizeEmployeeCode,
  parsePastProjectBlocks,
  PRIMARY_DOMAINS: [...PRIMARY_DOMAINS],
  PRIMARY_DOMAIN_LABELS,
  SKILL_WHITELIST,
  HIRE_SKILLS_MAX,
};

