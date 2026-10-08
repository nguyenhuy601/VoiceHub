/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisRoleSkill.js.
 * Only local text/role helpers replace legacy relative imports.
 */
const { normalizeRoleKey, isKnownProjectRole } = require('./roleKey');

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

function normProse(raw) {
  let text = String(raw || '');
  try {
    text = text.normalize('NFKC');
  } catch {
    /* Keep the original text on runtimes without Unicode normalization. */
  }
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/[\s\u00A0]+/g, ' ');
}

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
    const skill = normalizeSkillEntry(raw);
    if (!skill) continue;
    const key = skill.name.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...skill });
      continue;
    }
    if (
      typeof skill.level === 'number' &&
      (typeof existing.level !== 'number' || skill.level > existing.level)
    ) {
      existing.level = skill.level;
    }
  }
  return [...map.values()];
}

function buildPlanningSkills(container) {
  const collected = [];
  for (const cap of container?.analyses?.capability?.items || []) {
    for (const skill of cap.requiredSkills || []) collected.push(skill);
  }
  for (const entity of container?.analyses?.data?.entities || []) {
    if (entity.sensitivity === 'confidential' || entity.sensitivity === 'pii') {
      collected.push({ name: 'Security', level: 3 });
    }
    if ((entity.attributes || []).length) collected.push({ name: 'Database', level: 2 });
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
  const key = String(area || '').trim().toLowerCase();
  if (LAYER_ROLE_MATRIX[key]) return [...LAYER_ROLE_MATRIX[key]];
  return [];
}

function buildPlanningRoles(container, { unknownWarnings = [] } = {}) {
  const roles = new Map();
  const add = (roleKey, source) => {
    const key = normalizeRoleKey(roleKey);
    if (!key) return;
    if (!isKnownProjectRole(key)) unknownWarnings.push(key);
    const existing = roles.get(key);
    if (!existing) {
      roles.set(key, { roleKey: key, source });
      return;
    }
    if (existing.source === 'matrix' && source === 'wbs') existing.source = 'wbs';
  };

  for (const role of ALWAYS_ROLES) add(role, 'matrix');
  for (const task of container?.planning?.tasks || []) {
    for (const role of rolesFromArea(task.area)) add(role, 'matrix');
    if (task.suggestedRoleKey) add(task.suggestedRoleKey, 'wbs');
  }
  for (const cap of container?.analyses?.capability?.items || []) {
    const area = String(cap.module || '').toLowerCase();
    const skills = (cap.requiredSkills || [])
      .map((skill) => (typeof skill === 'string' ? skill : skill.name || ''))
      .join(' ')
      .toLowerCase();
    if (/react|frontend|ui/.test(skills)) add('frontend_developer', 'matrix');
    if (/api|node|backend|java/.test(skills)) add('backend_developer', 'matrix');
    if (/qa|test/.test(skills)) add('qa_engineer', 'matrix');
    if (/devops|docker|k8s/.test(skills)) add('devops_engineer', 'matrix');
    if (area.includes('auth')) add('backend_developer', 'matrix');
  }
  for (const arch of container?.analyses?.architectureImpact?.items || []) {
    for (const role of rolesFromArea(arch.layer)) add(role, 'matrix');
  }
  return {
    roles: [...roles.values()].sort((a, b) => a.roleKey.localeCompare(b.roleKey)),
    unknownRoleKeys: [...new Set(unknownWarnings)],
  };
}

function runRoleSkillPlanning(_pack, container) {
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
      hasProjectManager: roles.some((role) => role.roleKey === 'project_manager'),
    },
  };
}

function applyRoleSkillToContainer(container, result) {
  const next = { ...container, planning: { ...container.planning } };
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
