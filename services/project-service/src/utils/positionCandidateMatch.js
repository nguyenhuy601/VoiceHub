/**
 * Position ↔ jobTitle matching for Resource Planning candidates (Phase 3).
 * Soft signal only — Planned Allocation vẫn do PM nhập, không derive từ Position.
 */

const { MASTER_POSITIONS, resolveCanonicalPositionKey } = require('@enterprise/shared/config/masterData');

/** Project role key → preferred master Position keys (gợi ý staffing). */
const PROJECT_ROLE_PREFERRED_POSITIONS = Object.freeze({
  project_manager: ['product_manager', 'engineering_manager', 'team_lead'],
  product_owner: ['product_manager', 'business_analyst'],
  scrum_master: ['scrum_master', 'team_lead'],
  solution_architect: ['technical_lead', 'engineering_manager'],
  technical_lead: ['technical_lead', 'engineering_manager', 'software_developer'],
  business_analyst: ['business_analyst'],
  backend_developer: ['software_developer', 'technical_lead'],
  frontend_developer: ['software_developer', 'ux_designer'],
  mobile_developer: ['software_developer'],
  fullstack_developer: ['software_developer', 'technical_lead'],
  qa_lead: ['qa_engineer', 'team_lead'],
  qa_engineer: ['qa_engineer'],
  ui_ux_designer: ['ux_designer'],
  devops_engineer: ['devops_engineer'],
  observer: [],
  sponsor: [],
  stakeholder: [],
});

function normalizeJobTitle(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Resolve jobTitle string → master position key if it matches catalog (or enabled subset).
 * @param {string} jobTitle
 * @param {string[]|null} enabledPositionKeys — null = all master
 */
function resolvePositionKeyFromJobTitle(jobTitle, enabledPositionKeys = null) {
  const raw = normalizeJobTitle(jobTitle);
  if (!raw) return '';
  const enabled =
    Array.isArray(enabledPositionKeys) && enabledPositionKeys.length
      ? new Set(enabledPositionKeys.map(String))
      : null;

  const catalog = MASTER_POSITIONS.filter((p) => !enabled || enabled.has(p.key));

  const canonical = resolveCanonicalPositionKey(raw.replace(/\s+/g, '_'));
  if (catalog.some((p) => p.key === canonical)) return canonical;

  for (const p of catalog) {
    if (normalizeJobTitle(p.label) === raw) return p.key;
  }
  for (const p of catalog) {
    const label = normalizeJobTitle(p.label);
    if (raw.includes(label) || label.includes(raw) || raw.includes(p.key.replace(/_/g, ' '))) {
      return p.key;
    }
  }
  return '';
}

function preferredPositionsForProjectRole(projectRoleKey) {
  const key = String(projectRoleKey || '').trim().toLowerCase();
  return PROJECT_ROLE_PREFERRED_POSITIONS[key] || [];
}

/**
 * Soft boost for candidate scoring.
 * @returns {{ matchKey: string, preferred: boolean, boost: number, reason: string|null }}
 */
function scorePositionMatch({ jobTitle, projectRoleKey, enabledPositionKeys }) {
  const matchKey = resolvePositionKeyFromJobTitle(jobTitle, enabledPositionKeys);
  if (!matchKey) {
    return { matchKey: '', preferred: false, boost: 0, reason: null };
  }
  const preferred = preferredPositionsForProjectRole(projectRoleKey).includes(matchKey);
  return {
    matchKey,
    preferred,
    boost: preferred ? 15 : 8,
    reason: preferred ? 'position_preferred' : 'position_enabled',
  };
}

module.exports = {
  PROJECT_ROLE_PREFERRED_POSITIONS,
  resolvePositionKeyFromJobTitle,
  preferredPositionsForProjectRole,
  scorePositionMatch,
};
