const {
  REQUIREMENT_SKILL_WHITELIST,
  REQUIREMENT_SKILL_WHITELIST_LOWER,
  SUGGESTED_PROJECT_ROLE_SET,
} = require('../constants/requirementStaffing.constants');

function parseSkillsCsv(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveWhitelistSkill(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const match = REQUIREMENT_SKILL_WHITELIST.find((s) => s.toLowerCase() === lower);
  return match || trimmed;
}

function isKnownSkill(name) {
  return REQUIREMENT_SKILL_WHITELIST_LOWER.has(String(name || '').trim().toLowerCase());
}

function parseEstimateHours(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeRoleKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isKnownProjectRole(roleKey) {
  return SUGGESTED_PROJECT_ROLE_SET.has(normalizeRoleKey(roleKey));
}

module.exports = {
  parseSkillsCsv,
  resolveWhitelistSkill,
  isKnownSkill,
  parseEstimateHours,
  normalizeRoleKey,
  isKnownProjectRole,
};
