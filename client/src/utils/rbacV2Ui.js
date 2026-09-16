/**
 * Helper UI cho RBAC V2 — không duplicate catalog.
 * Catalog SoT: GET /permissions/catalog (rbacV2Catalog).
 */

export const RBAC_GRANTS_CHANGED_EVENT = 'voicehub:rbac-grants-changed';

/** Org Permission packs may keep Create Project only (Wave B). */
export const ORG_ALLOWED_PROJECT_GRANTS = Object.freeze(['project.project.create']);

export function isProjectMasterPermission(key) {
  return String(key || '')
    .trim()
    .startsWith('project.');
}

export function notifyRbacGrantsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RBAC_GRANTS_CHANGED_EVENT));
}

function projectPackKeySet(catalog) {
  return new Set(
    (Array.isArray(catalog?.projectPackTemplateKeys) ? catalog.projectPackTemplateKeys : [])
      .map((k) => String(k || '').trim())
      .filter(Boolean)
  );
}

/**
 * @param {string} templateKey
 * @param {{ projectPackTemplateKeys?: string[] } | null | undefined} catalog
 */
export function isProjectPackTemplateKey(templateKey, catalog) {
  const key = String(templateKey || '').trim();
  if (!key) return false;
  return projectPackKeySet(catalog).has(key);
}

/**
 * Draft/save strip options aligned with BE stripProjectGrantsUnlessProjectPack.
 * @returns {{ stripProject: boolean, stripProjectExcept?: string[] }}
 */
export function grantStripOptionsForTemplate(templateKey, catalog) {
  if (isProjectPackTemplateKey(templateKey, catalog)) {
    return { stripProject: false };
  }
  return { stripProject: true, stripProjectExcept: [...ORG_ALLOWED_PROJECT_GRANTS] };
}

/** Whether a master key may be toggled on the Permission Configuration tree. */
export function isToggleableMasterGrant(key, { isProjectPack = false } = {}) {
  const k = String(key || '').trim();
  if (!k) return false;
  if (!isProjectMasterPermission(k)) return true;
  if (isProjectPack) return true;
  return ORG_ALLOWED_PROJECT_GRANTS.includes(k);
}

/**
 * Org pack clone: ẩn project delivery templates.
 * Fail closed: thiếu projectPackTemplateKeys thì ẩn template có project.* ngoài Create Project.
 */
export function isOrgCloneableTemplate(tpl, catalog) {
  const key = String(tpl?.key || '').trim();
  if (!key) return false;
  if (isProjectPackTemplateKey(key, catalog)) return false;
  const grants = Array.isArray(tpl?.grants) ? tpl.grants : [];
  if (
    grants.some(
      (g) => isProjectMasterPermission(g) && !ORG_ALLOWED_PROJECT_GRANTS.includes(String(g || '').trim())
    )
  ) {
    return false;
  }
  return true;
}

export function flattenCatalogTree(tree = []) {
  const rows = [];
  for (const cat of Array.isArray(tree) ? tree : []) {
    for (const mod of cat?.modules || []) {
      for (const perm of mod?.permissions || []) {
        const key = String(perm?.key || '').trim();
        if (!key) continue;
        rows.push({
          key,
          action: perm.action || key.split('.').pop(),
          label: perm.label || perm.action || key,
          categoryKey: cat.key,
          categoryLabel: cat.label,
          moduleKey: mod.key,
          moduleLabel: mod.label,
        });
      }
    }
  }
  return rows;
}

export function normalizeMasterGrantList(grants = []) {
  return [
    ...new Set(
      (Array.isArray(grants) ? grants : [])
        .map((k) => String(k || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function countMasterGrants(grants = []) {
  return normalizeMasterGrantList(grants).length;
}

/**
 * @param {string[]} grants
 * @param {{ stripProject?: boolean, stripProjectExcept?: string[] }} [options]
 *   Default stripProject=true (org mode). Use stripProject=false for project packs.
 *   stripProjectExcept: keys kept when stripping (e.g. project.project.create).
 */
export function grantsDraftFromList(grants = [], { stripProject = true, stripProjectExcept = [] } = {}) {
  const except = new Set(
    (Array.isArray(stripProjectExcept) ? stripProjectExcept : [])
      .map((k) => String(k || '').trim())
      .filter(Boolean)
  );
  const draft = {};
  for (const raw of Array.isArray(grants) ? grants : []) {
    const key = String(raw || '').trim();
    if (!key) continue;
    if (stripProject && isProjectMasterPermission(key) && !except.has(key)) continue;
    draft[key] = true;
  }
  return draft;
}

/**
 * @param {Record<string, boolean>} draft
 * @param {{ stripProject?: boolean, stripProjectExcept?: string[] }} [options]
 */
export function grantKeysFromDraft(draft = {}, { stripProject = true, stripProjectExcept = [] } = {}) {
  const except = new Set(
    (Array.isArray(stripProjectExcept) ? stripProjectExcept : [])
      .map((k) => String(k || '').trim())
      .filter(Boolean)
  );
  return Object.keys(draft || {}).filter((k) => {
    if (!draft[k]) return false;
    if (stripProject && isProjectMasterPermission(k) && !except.has(k)) return false;
    return true;
  });
}

export function unwrapCatalogPayload(res) {
  const body = res?.data ?? res;
  const nested = body?.data ?? body;
  if (nested?.tree || nested?.masterPermissions || nested?.templates) return nested;
  if (body?.tree || body?.masterPermissions) return body;
  return nested || {};
}
