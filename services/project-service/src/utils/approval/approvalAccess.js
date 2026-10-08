const APPROVAL_ENTITY_TYPES = Object.freeze([
  'change_request',
  'task',
  'merge_request',
  'release',
  'planning_item',
  'requirement_pack',
]);

const ENTITY_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * @param {string} entityType
 * @param {string} entityId
 * @returns {boolean}
 */
function isValidEntityRef(entityType, entityId) {
  const type = String(entityType || '').trim();
  const id = String(entityId || '').trim();
  if (!APPROVAL_ENTITY_TYPES.includes(type)) return false;
  if (!id || !ENTITY_ID_RE.test(id)) return false;
  return true;
}

/**
 * Filter approval rows by injected access checkers (1 call per unique org/project).
 * @param {Array<{organizationId?: string, projectId?: string}>} rows
 * @param {{ canAccessOrg: (orgId: string) => boolean|Promise<boolean>, canViewProject: (projectId: string) => boolean|Promise<boolean> }} access
 */
async function filterApprovalsByAccess(rows, { canAccessOrg, canViewProject }) {
  const list = Array.isArray(rows) ? rows : [];
  const orgCache = new Map();
  const projectCache = new Map();

  async function orgOk(orgId) {
    const key = String(orgId || '').trim();
    if (!key) return false;
    if (orgCache.has(key)) return orgCache.get(key);
    const ok = Boolean(await canAccessOrg(key));
    orgCache.set(key, ok);
    return ok;
  }

  async function projectOk(projectId) {
    const key = String(projectId || '').trim();
    if (!key) return false;
    if (projectCache.has(key)) return projectCache.get(key);
    const ok = Boolean(await canViewProject(key));
    projectCache.set(key, ok);
    return ok;
  }

  const out = [];
  for (const row of list) {
    const orgId = String(row?.organizationId || '').trim();
    const projectId = String(row?.projectId || '').trim();
    if (orgId) {
      if (!(await orgOk(orgId))) continue;
      if (projectId && !(await projectOk(projectId))) continue;
      out.push(row);
      continue;
    }
    // Legacy rows without organizationId: allow only when project is viewable
    if (projectId && (await projectOk(projectId))) {
      out.push(row);
    }
  }
  return out;
}

module.exports = {
  APPROVAL_ENTITY_TYPES,
  isValidEntityRef,
  filterApprovalsByAccess,
};
