/**
 * Hồ sơ năng lực (C1) — validate catalog + FSM trạng thái.
 * Thuần logic (không Mongo) để unit test dễ; user.service gọi khi wire API (step 2).
 */

const {
  PRIMARY_DOMAINS,
  AVAILABILITY_VALUES,
  VERIFICATION_STATUSES,
  SKILL_LEVEL_MIN,
  SKILL_LEVEL_MAX,
  SUMMARY_MAX_LEN,
  YEARS_EXPERIENCE_MAX,
  MAX_SKILLS,
  MAX_TOP_SKILLS,
  MAX_BUSINESS_DOMAINS,
  MAX_CERTIFICATIONS,
  SENIORITY_BANDS,
  normalizeSkillName,
  normalizeBusinessDomainName,
  isPrimaryDomain,
  isAvailability,
  isSeniorityBand,
  proficiencyTierFromLevel,
} = require('../constants/capabilityCatalog');

function emptyCapability() {
  return {
    positionCode: '',
    primaryDomain: '',
    seniorityBand: '',
    yearsExperience: null,
    skills: [],
    businessDomains: [],
    certifications: [],
    languages: [],
    tools: [],
    availability: 'available',
    summary: '',
    verificationStatus: 'draft',
    source: 'manual',
    rejectReason: '',
    submittedAt: null,
    verifiedAt: null,
    verifiedBy: null,
    rejectedAt: null,
    updatedAt: null,
    cvFilePath: '',
    cvFileName: '',
    cvUploadedAt: null,
    projectExperiences: [],
  };
}

const PROJECT_EXPERIENCE_SOURCES = new Set(['excel_import', 'closed_board', 'cv_parse', 'manual']);
const PROJECT_EXPERIENCE_STATUSES = new Set(['verified', 'suggested']);
const PROJECT_EXPERIENCE_MAX = 20;
const PROJECT_EXPERIENCE_WORK_MAX = 300;
const EXCEL_PROJECT_EXPERIENCE_MAX = 5;

function experienceBoardKey(item) {
  return String(item?.evidenceBoardId || '').trim();
}

function lockProjectExperienceStatuses(incoming, currentList) {
  const prev = cloneProjectExperiences(currentList);
  const byBoard = new Map();
  for (const p of prev) {
    const k = experienceBoardKey(p);
    if (k) byBoard.set(k, p);
  }
  return cloneProjectExperiences(incoming).map((p) => {
    const match = experienceBoardKey(p) ? byBoard.get(experienceBoardKey(p)) : null;
    if (match) {
      return {
        ...p,
        status: match.status,
        source: match.source,
        evidenceBoardId: match.evidenceBoardId || p.evidenceBoardId,
      };
    }
    return { ...p, status: 'suggested' };
  });
}

/**
 * Idempotent merge: cùng evidenceBoardId không nhân đôi; đã verified thì không downgrade.
 */
function mergeClosedBoardExperience(existingList, incoming) {
  const exp = cloneProjectExperience({
    ...(incoming || {}),
    source: 'closed_board',
    status: 'suggested',
  });
  if (!exp || !exp.name || !exp.role || !exp.work || !experienceBoardKey(exp)) {
    return { ok: false, errorCode: 'CLOSED_BOARD_EXPERIENCE_INVALID', list: cloneProjectExperiences(existingList) };
  }
  exp.source = 'closed_board';
  exp.status = 'suggested';
  const list = cloneProjectExperiences(existingList);
  const boardId = experienceBoardKey(exp);
  const idx = list.findIndex((p) => experienceBoardKey(p) === boardId);
  if (idx >= 0) {
    if (list[idx].status === 'verified') {
      return { ok: true, list, skippedVerified: true };
    }
    list[idx] = { ...list[idx], ...exp, status: 'suggested', source: 'closed_board' };
  } else {
    list.push(exp);
  }
  return { ok: true, list: list.slice(0, PROJECT_EXPERIENCE_MAX), skippedVerified: false };
}

function cloneProjectExperience(item) {
  if (!item || typeof item !== 'object') return null;
  const name = String(item.name || '').trim();
  const role = String(item.role || '').trim();
  const work = String(item.work || '').trim().slice(0, PROJECT_EXPERIENCE_WORK_MAX);
  if (!name && !role && !work) return null;
  const yearRaw = item.year;
  let year;
  if (yearRaw != null && yearRaw !== '') {
    const y = Number(yearRaw);
    if (Number.isFinite(y) && y >= 1970 && y <= 2100) year = Math.floor(y);
  }
  const source = PROJECT_EXPERIENCE_SOURCES.has(String(item.source || ''))
    ? String(item.source)
    : 'manual';
  const status = PROJECT_EXPERIENCE_STATUSES.has(String(item.status || ''))
    ? String(item.status)
    : 'suggested';
  const out = { name, role, work, source, status };
  if (year != null) out.year = year;
  if (item.evidenceBoardId) out.evidenceBoardId = item.evidenceBoardId;
  return out;
}

function cloneProjectExperiences(list) {
  if (!Array.isArray(list)) return [];
  return list.map(cloneProjectExperience).filter(Boolean).slice(0, PROJECT_EXPERIENCE_MAX);
}

function cloneRankedItems(list, { normalizeName, maxItems }) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list.slice(0, maxItems)) {
    const name = normalizeName(item?.name ?? item);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let rank = Number(item?.rank);
    if (!Number.isFinite(rank) || rank < 1) rank = out.length + 1;
    out.push({ name, rank: Math.min(maxItems, Math.floor(rank)) });
  }
  return out.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function cloneCertifications(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list.slice(0, MAX_CERTIFICATIONS)) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim().slice(0, 120);
    if (!name) continue;
    const row = {
      name,
      issuer: String(item.issuer || '').trim().slice(0, 120),
      credentialId: String(item.credentialId || '').trim().slice(0, 120),
      verificationStatus: item.verificationStatus === 'verified' ? 'verified' : 'suggested',
    };
    if (item.issuedAt) {
      const d = new Date(item.issuedAt);
      if (!Number.isNaN(d.getTime())) row.issuedAt = d;
    }
    if (item.expiresAt) {
      const d = new Date(item.expiresAt);
      if (!Number.isNaN(d.getTime())) row.expiresAt = d;
    }
    out.push(row);
  }
  return out;
}

function enrichSkillsWithRank(skills) {
  const list = Array.isArray(skills) ? skills : [];
  return list.map((s, idx) => ({
    ...s,
    rank: Number.isFinite(Number(s.rank)) && Number(s.rank) >= 1 ? Number(s.rank) : idx + 1,
    proficiencyTier: proficiencyTierFromLevel(s.level),
  }));
}
function cloneCapability(input) {
  const base = emptyCapability();
  if (!input || typeof input !== 'object') return { ...base };
  const skills = Array.isArray(input.skills)
    ? enrichSkillsWithRank(input.skills.map((s) => ({ ...s })))
    : [];
  return {
    ...base,
    ...input,
    skills,
    businessDomains: Array.isArray(input.businessDomains)
      ? input.businessDomains.map((d) => ({ ...d }))
      : [],
    certifications: cloneCertifications(input.certifications),
    languages: Array.isArray(input.languages) ? [...input.languages] : [],
    tools: Array.isArray(input.tools) ? [...input.tools] : [],
    projectExperiences: cloneProjectExperiences(input.projectExperiences),
  };
}

/**
 * Chuẩn hóa + lọc field form từ input user (bỏ status/meta nhạy cảm).
 * @returns {{ ok: true, fields: object } | { ok: false, errorCode: string, message: string }}
 */
function sanitizeCapabilityFields(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errorCode: 'CAPABILITY_INVALID', message: 'capability must be an object' };
  }

  const fields = {};

  // Position SoT = UserProfile.preferences.jobTitle — bỏ ghi capability.positionCode từ form/API.

  if (raw.primaryDomain !== undefined) {
    const domain = String(raw.primaryDomain || '').trim();
    if (domain && !isPrimaryDomain(domain)) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_DOMAIN_INVALID',
        message: `primaryDomain must be one of: ${PRIMARY_DOMAINS.join(', ')}`,
      };
    }
    fields.primaryDomain = domain;
  }

  if (raw.yearsExperience !== undefined && raw.yearsExperience !== null && raw.yearsExperience !== '') {
    const years = Number(raw.yearsExperience);
    if (!Number.isFinite(years) || years < 0 || years > YEARS_EXPERIENCE_MAX) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_YEARS_INVALID',
        message: `yearsExperience must be 0–${YEARS_EXPERIENCE_MAX}`,
      };
    }
    fields.yearsExperience = Math.round(years);
  } else if (raw.yearsExperience === null || raw.yearsExperience === '') {
    fields.yearsExperience = null;
  }

  if (raw.seniorityBand !== undefined) {
    const band = String(raw.seniorityBand || '').trim();
    if (band && !isSeniorityBand(band)) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_SENIORITY_INVALID',
        message: `seniorityBand must be one of: ${SENIORITY_BANDS.join(', ')}`,
      };
    }
    fields.seniorityBand = band;
  }

  if (raw.skills !== undefined) {
    if (!Array.isArray(raw.skills)) {
      return { ok: false, errorCode: 'CAPABILITY_SKILLS_INVALID', message: 'skills must be an array' };
    }
    const seen = new Set();
    const skills = [];
    for (const item of raw.skills.slice(0, MAX_TOP_SKILLS)) {
      const name = normalizeSkillName(item?.name ?? item?.skill ?? item);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let level = Number(item?.level ?? 3);
      if (!Number.isFinite(level)) level = 3;
      level = Math.max(SKILL_LEVEL_MIN, Math.min(SKILL_LEVEL_MAX, Math.round(level)));
      const skillIdRaw = String(item?.skillId || '').trim();
      const skillEntry = { name, level, rank: skills.length + 1 };
      if (skillIdRaw) skillEntry.skillId = skillIdRaw;
      if (item?.experienceYears != null) {
        const exp = Number(item.experienceYears);
        if (Number.isFinite(exp)) skillEntry.experienceYears = Math.max(0, Math.min(YEARS_EXPERIENCE_MAX, exp));
      }
      if (item?.lastUsedAt) {
        const d = new Date(item.lastUsedAt);
        if (!Number.isNaN(d.getTime())) skillEntry.lastUsedAt = d;
      }
      skills.push(skillEntry);
    }
    fields.skills = enrichSkillsWithRank(skills);
  }

  if (raw.businessDomains !== undefined) {
    if (!Array.isArray(raw.businessDomains)) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_BUSINESS_DOMAINS_INVALID',
        message: 'businessDomains must be an array',
      };
    }
    fields.businessDomains = cloneRankedItems(raw.businessDomains, {
      normalizeName: normalizeBusinessDomainName,
      maxItems: MAX_BUSINESS_DOMAINS,
    });
  }

  if (raw.certifications !== undefined) {
    if (!Array.isArray(raw.certifications)) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_CERTIFICATIONS_INVALID',
        message: 'certifications must be an array',
      };
    }
    fields.certifications = cloneCertifications(raw.certifications);
  }

  if (raw.languages !== undefined) {
    fields.languages = normalizeStringList(raw.languages, MAX_SKILLS);
  }
  if (raw.tools !== undefined) {
    fields.tools = normalizeStringList(raw.tools, MAX_SKILLS);
  }

  if (raw.availability !== undefined) {
    const a = String(raw.availability || '').trim() || 'available';
    if (!isAvailability(a)) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_AVAILABILITY_INVALID',
        message: `availability must be one of: ${AVAILABILITY_VALUES.join(', ')}`,
      };
    }
    fields.availability = a;
  }

  if (raw.summary !== undefined) {
    fields.summary = String(raw.summary || '').trim().slice(0, SUMMARY_MAX_LEN);
  }

  if (raw.projectExperiences !== undefined) {
    if (!Array.isArray(raw.projectExperiences)) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_PROJECTS_INVALID',
        message: 'projectExperiences must be an array',
      };
    }
    fields.projectExperiences = cloneProjectExperiences(raw.projectExperiences);
  }

  return { ok: true, fields };
}

function normalizeStringList(list, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list.slice(0, max)) {
    const s = String(item || '').trim().slice(0, 80);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Submit tối thiểu — Position = jobTitle công ty (opts.jobTitle), không dùng positionCode.
 * @param {object} capability
 * @param {{ jobTitle?: string }} [opts]
 */
function requireSubmitMinimum(capability, opts = {}) {
  const jobTitle = String(opts.jobTitle || '').trim();
  const primaryDomain = String(capability.primaryDomain || '').trim();
  const skills = Array.isArray(capability.skills) ? capability.skills : [];
  if (!jobTitle) {
    return {
      ok: false,
      errorCode: 'CAPABILITY_SUBMIT_JOB_TITLE',
      message: 'Company jobTitle (Position) is required to submit',
    };
  }
  if (!primaryDomain || !isPrimaryDomain(primaryDomain)) {
    return { ok: false, errorCode: 'CAPABILITY_SUBMIT_DOMAIN', message: 'primaryDomain is required to submit' };
  }
  if (skills.length < 1) {
    return { ok: false, errorCode: 'CAPABILITY_SUBMIT_SKILLS', message: 'at least one skill is required to submit' };
  }
  if (capability.yearsExperience == null || !Number.isFinite(Number(capability.yearsExperience))) {
    return {
      ok: false,
      errorCode: 'CAPABILITY_SUBMIT_YEARS',
      message: 'yearsExperience is required to submit',
    };
  }
  return { ok: true };
}

/**
 * Áp dụng action FSM.
 * @param {object|null} currentCapability
 * @param {'save_draft'|'submit'|'verify'|'reject'} action
 * @param {object} [opts]
 * @param {object} [opts.fields] — form fields (sau sanitize)
 * @param {string} [opts.actorUserId]
 * @param {string} [opts.rejectReason]
 * @param {Date|string} [opts.now]
 */
function applyCapabilityAction(currentCapability, action, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const actorUserId = opts.actorUserId != null ? String(opts.actorUserId) : null;
  const next = cloneCapability(currentCapability);
  const act = String(action || '').trim();

  if (act === 'save_draft') {
    const sanitized = sanitizeCapabilityFields(opts.fields || {});
    if (!sanitized.ok) return sanitized;
    const prevStatus = String(currentCapability?.verificationStatus || 'draft');
    const prevSource = String(currentCapability?.source || next.source || '');
    const excelLocked = prevSource === 'excel_import' && prevStatus === 'verified';
    if (excelLocked) {
      delete sanitized.fields.primaryDomain;
      delete sanitized.fields.yearsExperience;
      delete sanitized.fields.skills;
      delete sanitized.fields.businessDomains;
      delete sanitized.fields.seniorityBand;
      delete sanitized.fields.projectExperiences;
    }
    Object.assign(next, sanitized.fields);
    // save_draft không đổi verificationStatus (và không nhận status từ payload)
    next.verificationStatus = VERIFICATION_STATUSES.includes(prevStatus) ? prevStatus : 'draft';
    if (next.verificationStatus === 'verified') {
      // giữ stamp verify cũ
      next.verifiedAt = currentCapability?.verifiedAt ?? next.verifiedAt;
      next.verifiedBy = currentCapability?.verifiedBy ?? next.verifiedBy;
    }
    next.source = resolveCapabilitySource(currentCapability?.source, opts.source);
    if (sanitized.fields.projectExperiences) {
      next.projectExperiences = lockProjectExperienceStatuses(
        sanitized.fields.projectExperiences,
        currentCapability?.projectExperiences
      );
    }
    if (opts.cvMeta && typeof opts.cvMeta === 'object') {
      if (opts.cvMeta.cvFilePath != null) next.cvFilePath = String(opts.cvMeta.cvFilePath);
      if (opts.cvMeta.cvFileName != null) next.cvFileName = String(opts.cvMeta.cvFileName);
      if (opts.cvMeta.cvUploadedAt != null) next.cvUploadedAt = opts.cvMeta.cvUploadedAt;
    } else {
      next.cvFilePath = currentCapability?.cvFilePath || next.cvFilePath || '';
      next.cvFileName = currentCapability?.cvFileName || next.cvFileName || '';
      next.cvUploadedAt = currentCapability?.cvUploadedAt || next.cvUploadedAt || null;
    }
    next.updatedAt = now;
    return { ok: true, capability: next };
  }

  if (act === 'submit') {
    const prevStatusSubmit = String(currentCapability?.verificationStatus || 'draft');
    const prevSourceSubmit = String(currentCapability?.source || '');
    if (prevSourceSubmit === 'excel_import' && prevStatusSubmit === 'verified') {
      return {
        ok: false,
        errorCode: 'CAPABILITY_EXCEL_LOCKED',
        message: 'Excel-verified capability cannot be resubmitted; ask HR to re-import',
      };
    }
    const sanitized = sanitizeCapabilityFields(opts.fields || {});
    if (!sanitized.ok) return sanitized;
    Object.assign(next, sanitized.fields);
    const min = requireSubmitMinimum(next, { jobTitle: opts.jobTitle });
    if (!min.ok) return min;
    next.verificationStatus = 'pending_hr';
    next.source = resolveCapabilitySource(currentCapability?.source, opts.source);
    if (sanitized.fields.projectExperiences) {
      next.projectExperiences = lockProjectExperienceStatuses(
        sanitized.fields.projectExperiences,
        currentCapability?.projectExperiences
      );
    }
    next.cvFilePath = currentCapability?.cvFilePath || next.cvFilePath || '';
    next.cvFileName = currentCapability?.cvFileName || next.cvFileName || '';
    next.cvUploadedAt = currentCapability?.cvUploadedAt || next.cvUploadedAt || null;
    next.submittedAt = now;
    next.rejectReason = '';
    next.rejectedAt = null;
    // clear verify stamp khi nộp lại
    next.verifiedAt = null;
    next.verifiedBy = null;
    next.updatedAt = now;
    return { ok: true, capability: next };
  }

  if (act === 'confirm_experience') {
    const boardId = String(opts.evidenceBoardId || opts.fields?.evidenceBoardId || '').trim();
    if (!boardId) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_CONFIRM_BOARD',
        message: 'evidenceBoardId is required',
      };
    }
    let found = false;
    next.projectExperiences = cloneProjectExperiences(next.projectExperiences).map((p) => {
      const src = String(p.source || '');
      const canConfirm = src === 'closed_board' || src === 'cv_parse';
      if (experienceBoardKey(p) === boardId && p.status === 'suggested' && canConfirm) {
        found = true;
        return { ...p, status: 'verified' };
      }
      return p;
    });
    if (!found) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_CONFIRM_NOT_FOUND',
        message: 'No suggested closed-board experience to confirm',
      };
    }
    next.updatedAt = now;
    return { ok: true, capability: next };
  }

  if (act === 'verify') {
    const status = String(currentCapability?.verificationStatus || next.verificationStatus || '');
    if (status !== 'pending_hr') {
      return {
        ok: false,
        errorCode: 'CAPABILITY_VERIFY_NOT_PENDING',
        message: 'Only pending_hr profiles can be verified',
      };
    }
    if (!actorUserId) {
      return { ok: false, errorCode: 'CAPABILITY_VERIFY_ACTOR', message: 'verifiedBy (actor) is required' };
    }
    next.verificationStatus = 'verified';
    next.verifiedAt = now;
    next.verifiedBy = actorUserId;
    next.rejectReason = '';
    next.rejectedAt = null;
    next.updatedAt = now;
    return { ok: true, capability: next };
  }

  if (act === 'reject') {
    const status = String(currentCapability?.verificationStatus || next.verificationStatus || '');
    if (status !== 'pending_hr') {
      return {
        ok: false,
        errorCode: 'CAPABILITY_REJECT_NOT_PENDING',
        message: 'Only pending_hr profiles can be rejected',
      };
    }
    const reason = String(opts.rejectReason || '').trim().slice(0, 500);
    if (!reason) {
      return {
        ok: false,
        errorCode: 'CAPABILITY_REJECT_REASON',
        message: 'rejectReason is required',
      };
    }
    next.verificationStatus = 'rejected';
    next.rejectReason = reason;
    next.rejectedAt = now;
    next.verifiedAt = null;
    next.verifiedBy = null;
    next.updatedAt = now;
    return { ok: true, capability: next };
  }

  return {
    ok: false,
    errorCode: 'CAPABILITY_ACTION_INVALID',
    message: `Unknown capabilityAction: ${act}`,
  };
}

/**
 * Payload công khai cho AI / member khác — chỉ khi verified.
 */
function resolveCapabilitySource(currentSource, optsSource) {
  if (optsSource === 'cv_parse') return 'cv_parse';
  if (optsSource === 'excel_import') return 'excel_import';
  const prev = String(currentSource || '');
  if (prev === 'excel_import' || prev === 'cv_parse' || prev === 'closed_board') return prev;
  return 'manual';
}

function toPublicVerifiedCapability(capability) {
  const c = cloneCapability(capability);
  if (c.verificationStatus !== 'verified') return null;
  const projectExperiences = cloneProjectExperiences(c.projectExperiences).filter(
    (p) => p.status === 'verified'
  );
  return {
    positionCode: c.positionCode || '',
    primaryDomain: c.primaryDomain || '',
    seniorityBand: c.seniorityBand || '',
    yearsExperience: c.yearsExperience,
    skills: enrichSkillsWithRank(c.skills || []),
    businessDomains: Array.isArray(c.businessDomains) ? c.businessDomains : [],
    certifications: cloneCertifications(c.certifications).filter(
      (cert) => cert.verificationStatus === 'verified'
    ),
    languages: c.languages,
    tools: c.tools,
    availability: c.availability || 'available',
    summary: c.summary || '',
    verificationStatus: 'verified',
    verifiedAt: c.verifiedAt || null,
    projectExperiences,
  };
}

const SELF_CAPABILITY_ACTIONS = new Set(['save_draft', 'submit', 'confirm_experience']);
const ADMIN_CAPABILITY_ACTIONS = new Set(['verify', 'reject', 'confirm_experience']);

/**
 * @param {'self'|'admin'} mode
 * @returns {{ action: string, fields?: object, rejectReason?: string }|null}
 */
function resolveCapabilityIntent(updateData, mode) {
  if (!updateData || typeof updateData !== 'object') return null;
  const hasAction = updateData.capabilityAction !== undefined && updateData.capabilityAction !== null;
  const hasFields = updateData.capability !== undefined && updateData.capability !== null;
  if (!hasAction && !hasFields) return null;

  let action = String(updateData.capabilityAction || '').trim();
  if (!action && hasFields && mode === 'self') action = 'save_draft';
  if (!action) {
    const err = new Error('capabilityAction is required');
    err.statusCode = 400;
    err.errorCode = 'CAPABILITY_ACTION_INVALID';
    throw err;
  }

  if (mode === 'self' && !SELF_CAPABILITY_ACTIONS.has(action)) {
    const err = new Error('Members may only save_draft, submit, or confirm_experience');
    err.statusCode = 403;
    err.errorCode = 'CAPABILITY_ACTION_FORBIDDEN';
    throw err;
  }
  if (mode === 'admin' && !ADMIN_CAPABILITY_ACTIONS.has(action)) {
    const err = new Error('Admins may only verify, reject, or confirm_experience');
    err.statusCode = 403;
    err.errorCode = 'CAPABILITY_ACTION_FORBIDDEN';
    throw err;
  }

  return {
    action,
    fields: hasFields && typeof updateData.capability === 'object' ? updateData.capability : {},
    rejectReason: updateData.rejectReason,
    evidenceBoardId: updateData.evidenceBoardId || updateData.capability?.evidenceBoardId,
  };
}

/**
 * Chuẩn vàng (1)+(a): verify/reject chỉ orgRole HR (companyAdmin.level === 'hr').
 * Owner/Admin vẫn vào được PATCH admin khác; chỉ chặn capabilityAction.
 * @returns {{ ok: true }|{ ok: false, statusCode: number, errorCode: string, message: string, messageUser: string }}
 */
function assertHrOnlyCapabilityReview(companyAdminLevel, capabilityAction) {
  const action = String(capabilityAction || '').trim().toLowerCase();
  if (action !== 'verify' && action !== 'reject') {
    return { ok: true };
  }
  const level = String(companyAdminLevel || '').trim().toLowerCase();
  if (level === 'hr') {
    return { ok: true };
  }
  return {
    ok: false,
    statusCode: 403,
    errorCode: 'CAPABILITY_HR_ONLY',
    message: 'Only HR can verify or reject capability profiles',
    messageUser: 'Chỉ HR được xác minh hoặc từ chối hồ sơ năng lực.',
  };
}

// ---------------- ResourceConfig (Capacity Gate) helpers ----------------
const SELF_RESOURCE_CONFIG_ACTIONS = new Set(['save']);
const ADMIN_RESOURCE_CONFIG_ACTIONS = new Set(['verify', 'reject']);

function sanitizeResourceConfigFields(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errorCode: 'RESOURCE_CONFIG_INVALID', message: 'resourceConfig must be an object' };
  }

  const fields = {};
  if (raw.maxConcurrentProjects !== undefined) {
    const max = Number(raw.maxConcurrentProjects);
    if (!Number.isFinite(max) || max < 1 || max > 20) {
      return {
        ok: false,
        errorCode: 'RESOURCE_CONFIG_MAX_INVALID',
        message: 'maxConcurrentProjects must be between 1 and 20',
      };
    }
    fields.maxConcurrentProjects = Math.floor(max);
  }

  if (Object.keys(fields).length === 0) {
    return { ok: false, errorCode: 'RESOURCE_CONFIG_EMPTY', message: 'No resourceConfig fields provided' };
  }

  return { ok: true, fields };
}

function assertHrOnlyResourceConfigReview(companyAdminLevel, resourceConfigAction) {
  const action = String(resourceConfigAction || '').trim().toLowerCase();
  if (action !== 'verify' && action !== 'reject') return { ok: true };

  const level = String(companyAdminLevel || '').trim().toLowerCase();
  if (level === 'hr') return { ok: true };

  return {
    ok: false,
    statusCode: 403,
    errorCode: 'RESOURCE_CONFIG_HR_ONLY',
    message: 'Only HR can verify or reject resource config',
    messageUser: 'Chỉ HR được xác minh hoặc từ chối cấu hình công suất.',
  };
}

/**
 * @param {'self'|'admin'} mode
 * @returns {{action:'save'|'verify'|'reject', fields:{maxConcurrentProjects?:number}, rejectReason?:string}|null}
 */
function resolveResourceConfigIntent(updateData, mode) {
  if (!updateData || typeof updateData !== 'object') return null;

  const hasFields = updateData.resourceConfig !== undefined && updateData.resourceConfig !== null;
  if (!hasFields) return null;

  const rawAction = String(updateData.resourceConfigAction || '').trim().toLowerCase();
  const action = !rawAction && mode === 'self' ? 'save' : rawAction;
  if (!action) {
    const err = new Error('resourceConfigAction is required');
    err.statusCode = 400;
    err.errorCode = 'RESOURCE_CONFIG_ACTION_INVALID';
    throw err;
  }

  if (mode === 'self' && !SELF_RESOURCE_CONFIG_ACTIONS.has(action)) {
    const err = new Error('Members may only save resourceConfig');
    err.statusCode = 403;
    err.errorCode = 'RESOURCE_CONFIG_ACTION_FORBIDDEN';
    throw err;
  }

  if (mode === 'admin' && !ADMIN_RESOURCE_CONFIG_ACTIONS.has(action)) {
    const err = new Error('Admins may only verify or reject resourceConfig');
    err.statusCode = 403;
    err.errorCode = 'RESOURCE_CONFIG_ACTION_FORBIDDEN';
    throw err;
  }

  const sanitized = sanitizeResourceConfigFields(updateData.resourceConfig);
  if (!sanitized.ok) {
    const err = new Error(sanitized.message);
    err.statusCode = 400;
    err.errorCode = sanitized.errorCode;
    throw err;
  }

  const rejectReason = String(
    updateData.resourceConfig?.rejectReason || updateData.rejectReason || ''
  ).trim().slice(0, 500);

  if (action === 'reject' && !rejectReason) {
    const err = new Error('rejectReason is required when rejecting resourceConfig');
    err.statusCode = 400;
    err.errorCode = 'RESOURCE_CONFIG_REJECT_REASON';
    throw err;
  }

  return { action, fields: sanitized.fields, rejectReason };
}

module.exports = {
  emptyCapability,
  cloneCapability,
  cloneProjectExperiences,
  mergeClosedBoardExperience,
  lockProjectExperienceStatuses,
  PROJECT_EXPERIENCE_MAX,
  EXCEL_PROJECT_EXPERIENCE_MAX,
  sanitizeCapabilityFields,
  requireSubmitMinimum,
  applyCapabilityAction,
  toPublicVerifiedCapability,
  resolveCapabilityIntent,
  assertHrOnlyCapabilityReview,
  SELF_CAPABILITY_ACTIONS,
  ADMIN_CAPABILITY_ACTIONS,
  sanitizeResourceConfigFields,
  resolveResourceConfigIntent,
  enrichSkillsWithRank,
  cloneCertifications,
  cloneRankedItems,
  assertHrOnlyResourceConfigReview,
};
