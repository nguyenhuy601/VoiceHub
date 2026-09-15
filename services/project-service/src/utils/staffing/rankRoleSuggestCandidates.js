/**
 * Rank org members for wizard intake role suggest (PO / PM / BA).
 * Boost: Position match + verified CV capability + prior role / verified project experience.
 * No CV raw / experience.work in output.
 */

const { scorePositionMatch } = require('./positionCandidateMatch');
const { scoreVerifiedCapability } = require('./capabilityMatch');

const INTAKE_LEAD_ROLE_KEYS = Object.freeze([
  'product_owner',
  'project_manager',
  'business_analyst',
]);

const PRIOR_ROLE_BOOST = 12;

function normalizeRoleToken(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function verifiedExperienceMatchesRole(verifiedCapability, projectRoleKey) {
  const key = normalizeRoleToken(projectRoleKey);
  if (!key) return false;
  const rows = Array.isArray(verifiedCapability?.projectExperiences)
    ? verifiedCapability.projectExperiences
    : [];
  return rows.some((row) => {
    if (String(row?.status || '') !== 'verified') return false;
    const role = normalizeRoleToken(row.role);
    if (!role) return false;
    return role === key || role.includes(key) || key.includes(role);
  });
}

function parseIntakeRoleKeys(raw) {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  return [...new Set(parts.map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
}

function isExactIntakeRoleKeys(keys) {
  const set = new Set(parseIntakeRoleKeys(keys));
  return INTAKE_LEAD_ROLE_KEYS.every((k) => set.has(k)) && set.size === INTAKE_LEAD_ROLE_KEYS.length;
}

/** 1–3 key thuộc intake; không chấp nhận key lạ. */
function isAllowedIntakeRoleKeys(keys) {
  const parsed = parseIntakeRoleKeys(keys);
  if (!parsed.length || parsed.length > INTAKE_LEAD_ROLE_KEYS.length) return false;
  const allowed = new Set(INTAKE_LEAD_ROLE_KEYS);
  return parsed.every((k) => allowed.has(k));
}

function resolveRequestedIntakeRoleKeys(raw) {
  if (!isAllowedIntakeRoleKeys(raw)) return null;
  const set = new Set(parseIntakeRoleKeys(raw));
  return INTAKE_LEAD_ROLE_KEYS.filter((k) => set.has(k));
}

function parseRoleSuggestOffset(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    const err = new Error('offset không hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_REQUIRED';
    throw err;
  }
  return n;
}

function sliceRoleSuggestPage(items = [], { offset = 0, limit = 3 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const lim = Math.max(1, Math.floor(Number(limit) || 3));
  const page = list.slice(off, off + lim);
  return {
    items: page,
    hasMore: off + page.length < total,
    total,
  };
}

function parseRoleSuggestFitAvailable(raw, defaultValue = false) {
  if (raw == null || raw === '') return defaultValue;
  if (raw === true || raw === false) return raw;
  const s = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return defaultValue;
}

function isRoleSuggestFit(item = {}) {
  const reasons = Array.isArray(item.suggestReasons) ? item.suggestReasons : [];
  return reasons.includes('position_preferred') || reasons.includes('prior_role');
}

function isRoleSuggestUnderCap(item = {}) {
  if (String(item.availability || '').toLowerCase() === 'overallocated') return false;
  if (item.allocatedPct == null || item.allocatedPct === '') return true;
  const pct = Number(item.allocatedPct);
  if (!Number.isFinite(pct)) return true;
  return pct < 100;
}

function filterRoleSuggestFitAvailable(items = []) {
  return (Array.isArray(items) ? items : []).filter(
    (row) => isRoleSuggestFit(row) && isRoleSuggestUnderCap(row)
  );
}

function rankRoleSuggestCandidate(input = {}, { projectRoleKey, enabledPositionKeys } = {}) {
  const roleKey = String(projectRoleKey || '').trim().toLowerCase();
  const jobTitle = String(input.jobTitle || '').trim();
  const cap = input.verifiedCapability || null;
  const isVerified = Boolean(cap && String(cap.verificationStatus || '') === 'verified');
  const verifiedCap = isVerified ? cap : null;

  const positionMatch = scorePositionMatch({
    jobTitle,
    projectRoleKey: roleKey,
    enabledPositionKeys,
  });
  const capabilityMatch = scoreVerifiedCapability({
    verifiedCapability: verifiedCap,
    projectRoleKey: roleKey,
  });

  const hasPriorRole = Boolean(input.hasPriorRole);
  const hasVerifiedExp = verifiedExperienceMatchesRole(verifiedCap, roleKey);
  const priorBoost = hasPriorRole || hasVerifiedExp ? PRIOR_ROLE_BOOST : 0;

  const suggestReasons = [];
  if (positionMatch.preferred) suggestReasons.push('position_preferred');
  if (isVerified) suggestReasons.push('cv_verified');
  if (hasPriorRole || hasVerifiedExp) suggestReasons.push('prior_role');

  const out = {
    userId: String(input.userId || ''),
    displayName: String(input.displayName || '').trim() || String(input.userId || '').slice(-6),
    jobTitle,
    positionKey: positionMatch.matchKey || null,
    score: Math.round((positionMatch.boost || 0) + (capabilityMatch.boost || 0) + priorBoost),
    suggestReasons: [...new Set(suggestReasons)],
    priorRoleKeys: hasPriorRole ? [roleKey] : [],
  };
  if (isVerified && verifiedCap.yearsExperience != null && Number.isFinite(Number(verifiedCap.yearsExperience))) {
    out.yearsExperience = Number(verifiedCap.yearsExperience);
  }
  return out;
}

/** Public whitelist — never include capability nested / experience.work / email. */
function toRoleSuggestPublicItem(ranked = {}) {
  const out = {
    userId: String(ranked.userId || ''),
    displayName: String(ranked.displayName || '').trim() || String(ranked.userId || '').slice(-6),
    jobTitle: String(ranked.jobTitle || '').trim(),
    positionKey: ranked.positionKey || null,
    score: Number(ranked.score) || 0,
    suggestReasons: Array.isArray(ranked.suggestReasons) ? ranked.suggestReasons.filter(Boolean) : [],
    priorRoleKeys: Array.isArray(ranked.priorRoleKeys) ? ranked.priorRoleKeys.filter(Boolean) : [],
  };
  if (ranked.yearsExperience != null && Number.isFinite(Number(ranked.yearsExperience))) {
    out.yearsExperience = Number(ranked.yearsExperience);
  }
  if (ranked.allocatedPct != null && Number.isFinite(Number(ranked.allocatedPct))) {
    out.allocatedPct = Math.round(Number(ranked.allocatedPct) * 100) / 100;
  }
  const availability = String(ranked.availability || '').trim().toLowerCase();
  if (availability === 'available' || availability === 'partial' || availability === 'overallocated') {
    out.availability = availability;
  }
  return out;
}

function sortRoleSuggestItems(items = []) {
  return [...items].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'vi');
  });
}

module.exports = {
  INTAKE_LEAD_ROLE_KEYS,
  PRIOR_ROLE_BOOST,
  parseIntakeRoleKeys,
  isExactIntakeRoleKeys,
  isAllowedIntakeRoleKeys,
  resolveRequestedIntakeRoleKeys,
  parseRoleSuggestOffset,
  sliceRoleSuggestPage,
  parseRoleSuggestFitAvailable,
  isRoleSuggestFit,
  isRoleSuggestUnderCap,
  filterRoleSuggestFitAvailable,
  verifiedExperienceMatchesRole,
  rankRoleSuggestCandidate,
  toRoleSuggestPublicItem,
  sortRoleSuggestItems,
};
