/** Legacy tab helpers — URL /w/:slug đã bỏ; giữ cho OrganizationMainPanel. */

export const WORKSPACE_TAB_VALUES = ['chat', 'tasks', 'documents', 'notifications'];

export function normalizeWorkspaceTab(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (WORKSPACE_TAB_VALUES.includes(v)) return v;
  return 'chat';
}

export function isWorkspaceAuxTab(tab) {
  return tab === 'tasks' || tab === 'documents' || tab === 'notifications';
}
