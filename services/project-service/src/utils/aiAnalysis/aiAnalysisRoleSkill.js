/**
 * Job3 Role/Skill Planning (W4) — planning.skills + planning.roles.
 * Matrix deterministic + union task.suggestedRoleKey; always include project_manager.
 */

const { normalizeRoleKey, isKnownProjectRole } = require('./requirementStaffingParse');
const { normProse } = require('./requirementTemplateTextNorm');
const { truncate } = require('./aiAnalysisFrSlice');
const { AREA_ROLE_HINT } = require('./aiAnalysisWbs');

const ALWAYS_ROLES = Object.freeze(['project_manager', 'business_analyst']);

const LAYER_ROLE_MATRIX = Object.freeze({
  frontend: ['frontend_developer', 'ui_ux_designer'],
  backend: ['backend_developer'],
  database: ['backend_developer'],
  api: ['backend_developer'],
  auth: ['backend_developer'],
  infrastructure: ['devops_engineer'],
  external: ['backend_developer', 'devops_engineer'],
  security: ['backend_developer'],
  deployment: ['devops_engineer'],
  qa: ['qa_engineer'],
  design: ['ui_ux_designer'],
  management: ['project_manager'],
  analysis: ['business_analyst'],
});

function normalizeSkillEntry(raw) {
  if (typeof raw === 'string') {
    const name = normProse(raw).slice(0, 128);
    return name ? { name } : null;
  }
  if (raw && typeof raw === 'object') {
    const name = normProse(raw.name || raw.skill || '').slice(0, 128);
    if (!name) return null;
    let level;
    if (raw.level != null && Number.isFinite(Number(raw.level))) {
      level = Math.max(1, Math.min(5, Math.round(Number(raw.level))));
    }
    return level != null ? { name, level } : { name };
  }
  return null;
}

function dedupeSkills(skills = []) {
  const map = new Map();
  for (const raw of skills) {
    const s = normalizeSkillEntry(raw);
    if (!s) continue;
    const key = s.name.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...s });
      continue;
    }
    if (
      typeof s.level === 'number' &&
      (typeof existing.level !== 'number' || s.level > existing.level)
    ) {
      existing.level = s.level;
    }
  }
  return [...map.values()];
}

/**
 * Merge skills from capability.requiredSkills (+ optional data/arch hints).
 */
function buildPlanningSkills(container) {
  const collected = [];
  for (const cap of container?.analyses?.capability?.items || []) {
    for (const sk of cap.requiredSkills || []) collected.push(sk);
  }
  for (const ent of container?.analyses?.data?.entities || []) {
    if (ent.sensitivity === 'confidential' || ent.sensitivity === 'pii') {
      collected.push({ name: 'Security', level: 3 });
    }
    if ((ent.attributes || []).length) {
      collected.push({ name: 'Database', level: 2 });
    }
  }
  for (const arch of container?.analyses?.architectureImpact?.items || []) {
    if (arch.layer === 'frontend') collected.push({ name: 'React', level: 3 });
    if (arch.layer === 'api' || arch.layer === 'backend') {
      collected.push({ name: 'REST API', level: 3 });
    }
    if (arch.layer === 'infrastructure' || arch.layer === 'deployment') {
      collected.push({ name: 'DevOps', level: 3 });
    }
  }
  return dedupeSkills(collected);
}

function rolesFromArea(area) {
  const key = String(area || '')
    .trim()
    .toLowerCase();
  if (LAYER_ROLE_MATRIX[key]) return [...LAYER_ROLE_MATRIX[key]];
  if (AREA_ROLE_HINT[key]) return [AREA_ROLE_HINT[key]];
  return [];
}

/**
 * Role matrix from WBS area/capability + union task.suggestedRoleKey.
 * Always includes PM (+ BA). Unknown role keys kept with warning (soft).
 */
function buildPlanningRoles(container, { unknownWarnings = [] } = {}) {
  const roles = new Map();

  const add = (roleKey, source) => {
    const key = normalizeRoleKey(roleKey);
    if (!key) return;
    if (!isKnownProjectRole(key)) {
      unknownWarnings.push(key);
      // soft keep — plan: skill→role soft + warning if unknown
    }
    const existing = roles.get(key);
    if (!existing) {
      roles.set(key, { roleKey: key, source });
      return;
    }
    if (existing.source === 'matrix' && source === 'wbs') {
      existing.source = 'wbs';
    }
  };

  for (const role of ALWAYS_ROLES) add(role, 'matrix');

  for (const task of container?.planning?.tasks || []) {
    for (const r of rolesFromArea(task.area)) add(r, 'matrix');
    if (task.suggestedRoleKey) add(task.suggestedRoleKey, 'wbs');
  }

  for (const cap of container?.analyses?.capability?.items || []) {
    const area = String(cap.module || '').toLowerCase();
    // light hint from skills
    const skills = (cap.requiredSkills || [])
      .map((s) => (typeof s === 'string' ? s : s.name || ''))
      .join(' ')
      .toLowerCase();
    if (/react|frontend|ui/.test(skills)) add('frontend_developer', 'matrix');
    if (/api|node|backend|java/.test(skills)) add('backend_developer', 'matrix');
    if (/qa|test/.test(skills)) add('qa_engineer', 'matrix');
    if (/devops|docker|k8s/.test(skills)) add('devops_engineer', 'matrix');
    if (area.includes('auth')) add('backend_developer', 'matrix');
  }

  for (const arch of container?.analyses?.architectureImpact?.items || []) {
    for (const r of rolesFromArea(arch.layer)) add(r, 'matrix');
  }

  return {
    roles: [...roles.values()].sort((a, b) => a.roleKey.localeCompare(b.roleKey)),
    unknownRoleKeys: [...new Set(unknownWarnings)],
  };
}

function runRoleSkillPlanning(pack, container) {
  const skills = buildPlanningSkills(container);
  const { roles, unknownRoleKeys } = buildPlanningRoles(container);
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    skills,
    roles,
    meta: {
      source: 'matrix',
      llmCalls: 0,
      unknownRoleKeys,
      skillCount: skills.length,
      roleCount: roles.length,
      hasProjectManager: roles.some((r) => r.roleKey === 'project_manager'),
    },
  };
}

function applyRoleSkillToContainer(container, result) {
  const next = {
    ...container,
    planning: { ...container.planning },
  };
  next.planning.skills = result.skills || [];
  next.planning.roles = result.roles || [];
  return next;
}

module.exports = {
  ALWAYS_ROLES,
  LAYER_ROLE_MATRIX,
  normalizeSkillEntry,
  dedupeSkills,
  buildPlanningSkills,
  buildPlanningRoles,
  rolesFromArea,
  runRoleSkillPlanning,
  applyRoleSkillToContainer,
};
