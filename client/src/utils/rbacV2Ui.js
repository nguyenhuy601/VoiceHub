/**
 * Helper UI cho RBAC V2 — không duplicate catalog.
 * Catalog SoT: GET /permissions/catalog (rbacV2Catalog).
 */

export const RBAC_GRANTS_CHANGED_EVENT = 'voicehub:rbac-grants-changed';

export function isProjectMasterPermission(key) {
  return String(key || '')
    .trim()
    .startsWith('project.');
}

export function notifyRbacGrantsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RBAC_GRANTS_CHANGED_EVENT));
}

/**
 * Org pack clone: ẩn project templates.
 * Fail closed: thiếu projectPackTemplateKeys thì ẩn template có grant `project.*`.
 */
export function isOrgCloneableTemplate(tpl, catalog) {
  const key = String(tpl?.key || '').trim();
  if (!key) return false;
  const packKeys = Array.isArray(catalog?.projectPackTemplateKeys)
    ? catalog.projectPackTemplateKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  if (packKeys.includes(key)) return false;
  const grants = Array.isArray(tpl?.grants) ? tpl.grants : [];
  if (grants.some(isProjectMasterPermission)) return false;
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

export function grantsDraftFromList(grants = [], { stripProject = true } = {}) {
  const draft = {};
  for (const raw of Array.isArray(grants) ? grants : []) {
    const key = String(raw || '').trim();
    if (!key) continue;
    if (stripProject && isProjectMasterPermission(key)) continue;
    draft[key] = true;
  }
  return draft;
}

export function grantKeysFromDraft(draft = {}, { stripProject = true } = {}) {
  return Object.keys(draft || {}).filter((k) => {
    if (!draft[k]) return false;
    if (stripProject && isProjectMasterPermission(k)) return false;
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
