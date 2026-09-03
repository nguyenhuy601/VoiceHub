/**
 * Org-level Requirement Access Policy — SSOT normalize + defaults.
 * Job title / org membership → persona; persona → visibility + actions.
 */

const REQUIREMENT_PERSONAS = Object.freeze(['submitter', 'approver', 'operator', 'member']);

const REQUIREMENT_ACTION_KEYS = Object.freeze([
  'view',
  'import',
  'submit',
  'approve',
  'runAiPlanning',
  'createProject',
  'reviewSkills',
]);

const REQUIREMENT_VISIBILITY_KEYS = Object.freeze([
  'collaborateRequirements',
  'adminRequirements',
]);

const DEFAULT_PERSONA_BY_POSITION = Object.freeze({
  submitter: {
    positionKeys: ['business_analyst'],
    projectRoleKeys: ['business_analyst'],
    aliases: [],
  },
  approver: {
    positionKeys: ['product_manager'],
    projectRoleKeys: ['product_owner', 'project_manager'],
    aliases: ['product owner', 'product_owner', 'project manager', 'project_manager'],
  },
});

const DEFAULT_PERSONA_BY_ORG_ROLE = Object.freeze({
  operator: {
    membershipRoles: ['owner', 'admin', 'hr'],
  },
});

const DEFAULT_VISIBILITY = Object.freeze({
  submitter: { collaborateRequirements: true, adminRequirements: false },
  approver: { collaborateRequirements: true, adminRequirements: false },
  operator: { collaborateRequirements: false, adminRequirements: true },
  member: { collaborateRequirements: false, adminRequirements: false },
});

const DEFAULT_ACTIONS = Object.freeze({
  submitter: {
    view: true,
    import: true,
    submit: true,
    approve: false,
    runAiPlanning: false,
    createProject: false,
    reviewSkills: true,
  },
  approver: {
    view: true,
    import: false,
    submit: false,
    approve: true,
    runAiPlanning: true,
    createProject: true,
    reviewSkills: true,
  },
  operator: {
    view: true,
    import: true,
    submit: true,
    approve: false,
    runAiPlanning: true,
    createProject: false,
    reviewSkills: true,
  },
  member: {
    view: true,
    import: false,
    submit: false,
    approve: false,
    runAiPlanning: false,
    createProject: false,
    reviewSkills: false,
  },
});

function uniqueStrings(values = []) {
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizePersonaMapping(raw, fallback = {}) {
  if (raw === undefined || raw === null) {
    return {
      positionKeys: uniqueStrings(fallback.positionKeys || []),
      projectRoleKeys: uniqueStrings(fallback.projectRoleKeys || []),
      aliases: uniqueStrings(fallback.aliases || []).map((item) => item.toLowerCase()),
    };
  }
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    positionKeys: uniqueStrings(Array.isArray(input.positionKeys) ? input.positionKeys : []),
    projectRoleKeys: uniqueStrings(Array.isArray(input.projectRoleKeys) ? input.projectRoleKeys : []),
    aliases: uniqueStrings(Array.isArray(input.aliases) ? input.aliases : []).map((item) =>
      item.toLowerCase()
    ),
  };
}

function normalizeOrgRoleMapping(raw, fallback = {}) {
  if (raw === undefined || raw === null) {
    return {
      membershipRoles: uniqueStrings(fallback.membershipRoles || []).map((item) => item.toLowerCase()),
    };
  }
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    membershipRoles: uniqueStrings(Array.isArray(input.membershipRoles) ? input.membershipRoles : []).map(
      (item) => item.toLowerCase()
    ),
  };
}

function normalizeActionRow(raw = {}, fallback = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const row = {};
  for (const key of REQUIREMENT_ACTION_KEYS) {
    row[key] = key in input ? Boolean(input[key]) : Boolean(base[key]);
  }
  return row;
}

function normalizeVisibilityRow(raw = {}, fallback = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const row = {};
  for (const key of REQUIREMENT_VISIBILITY_KEYS) {
    row[key] = key in input ? Boolean(input[key]) : Boolean(base[key]);
  }
  return row;
}

function defaultRequirementAccessPolicy() {
  return normalizeRequirementAccessPolicy({});
}

/**
 * @param {object} [raw]
 * @returns {object}
 */
function normalizeRequirementAccessPolicy(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const personaByPositionIn =
    input.personaByPosition && typeof input.personaByPosition === 'object'
      ? input.personaByPosition
      : {};
  const personaByOrgRoleIn =
    input.personaByOrgRole && typeof input.personaByOrgRole === 'object'
      ? input.personaByOrgRole
      : {};
  const visibilityIn =
    input.visibility && typeof input.visibility === 'object' ? input.visibility : {};
  const actionsIn = input.actions && typeof input.actions === 'object' ? input.actions : {};

  const personaByPosition = {
    submitter: normalizePersonaMapping(
      personaByPositionIn.submitter,
      personaByPositionIn.submitter === undefined
        ? DEFAULT_PERSONA_BY_POSITION.submitter
        : undefined
    ),
    approver: normalizePersonaMapping(
      personaByPositionIn.approver,
      personaByPositionIn.approver === undefined
        ? DEFAULT_PERSONA_BY_POSITION.approver
        : undefined
    ),
  };

  const personaByOrgRole = {
    operator: normalizeOrgRoleMapping(
      personaByOrgRoleIn.operator,
      personaByOrgRoleIn.operator === undefined ? DEFAULT_PERSONA_BY_ORG_ROLE.operator : undefined
    ),
  };

  const visibility = {};
  const actions = {};
  for (const persona of REQUIREMENT_PERSONAS) {
    visibility[persona] = normalizeVisibilityRow(
      visibilityIn[persona],
      DEFAULT_VISIBILITY[persona] || DEFAULT_VISIBILITY.member
    );
    actions[persona] = normalizeActionRow(
      actionsIn[persona],
      DEFAULT_ACTIONS[persona] || DEFAULT_ACTIONS.member
    );
  }

  return {
    version: 1,
    personaByPosition,
    personaByOrgRole,
    visibility,
    actions,
  };
}

/**
 * @param {object} policy
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateRequirementAccessPolicy(policy) {
  const normalized = normalizeRequirementAccessPolicy(policy);
  const approver = normalized.personaByPosition?.approver || {};
  const hasApproverMapping =
    (approver.positionKeys || []).length > 0 ||
    (approver.projectRoleKeys || []).length > 0 ||
    (approver.aliases || []).length > 0;
  if (!hasApproverMapping) {
    return { ok: false, message: 'Cần ít nhất một mapping approver (PO/PM)' };
  }
  if (!normalized.actions?.approver?.approve) {
    return { ok: false, message: 'Persona approver phải có quyền approve' };
  }
  return { ok: true, policy: normalized };
}

function mergePersonaActions(personas = [], policy) {
  const normalized = normalizeRequirementAccessPolicy(policy);
  const merged = {};
  for (const key of REQUIREMENT_ACTION_KEYS) {
    merged[key] = personas.some((persona) => Boolean(normalized.actions?.[persona]?.[key]));
  }
  return merged;
}

function mergePersonaVisibility(personas = [], policy) {
  const normalized = normalizeRequirementAccessPolicy(policy);
  const merged = {};
  for (const key of REQUIREMENT_VISIBILITY_KEYS) {
    merged[key] = personas.some((persona) => Boolean(normalized.visibility?.[persona]?.[key]));
  }
  return merged;
}

module.exports = {
  REQUIREMENT_PERSONAS,
  REQUIREMENT_ACTION_KEYS,
  REQUIREMENT_VISIBILITY_KEYS,
  DEFAULT_PERSONA_BY_POSITION,
  DEFAULT_PERSONA_BY_ORG_ROLE,
  DEFAULT_VISIBILITY,
  DEFAULT_ACTIONS,
  defaultRequirementAccessPolicy,
  normalizeRequirementAccessPolicy,
  validateRequirementAccessPolicy,
  mergePersonaActions,
  mergePersonaVisibility,
};
