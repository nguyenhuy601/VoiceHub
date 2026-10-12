/**
 * SoD keys FE không cho bỏ tick (khớp BE sodLockedPermissionsForRoleKey).
 * BE vẫn force-add khi PATCH — đây chỉ UX.
 */
const SOD_LOCKED_BY_ROLE_KEY = Object.freeze({
  business_analyst: Object.freeze([
    'analysis:ba_review',
    'analysis:submit_ba_review',
    'analysis:document_upload',
    'analysis:artifact_import',
    'analysis:artifact_edit',
  ]),
  product_owner: Object.freeze([
    'analysis:po_review',
    'planning:po_review',
    'handover:accept',
    'uat:sign_off',
  ]),
  project_manager: Object.freeze([
    'planning:pm_review',
    'planning:artifact_edit',
    'planning:cut_baseline',
    'planning:publish_wbs',
  ]),
  technical_lead: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
  tech_lead: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
  solution_architect: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
  architect: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
});

export function sodLockedPermissionSet(roleKey) {
  const key = String(roleKey || '').trim().toLowerCase();
  const list = SOD_LOCKED_BY_ROLE_KEY[key] || [];
  return new Set(list);
}

export function isSodLockedPermission(roleKey, permissionKey) {
  return sodLockedPermissionSet(roleKey).has(String(permissionKey || '').trim());
}
