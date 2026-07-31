/** Legacy tab helpers — URL /w/:slug đã bỏ; giữ cho OrganizationMainPanel. */

export const WORKSPACE_TAB_VALUES = [
  'chat',
  'voice',
  'tasks',
  'documents',
  'notifications',
  'announcement',
  'members',
  'calendar',
  'meetings',
];

/** IA phòng ban: announcement + tasks (Project Hub) + members/docs/calendar/meetings. Voice/chat → announcement. */
export const DEPT_WORKSPACE_TAB_VALUES = [
  'announcement',
  'tasks',
  'members',
  'documents',
  'calendar',
  'meetings',
];

/** Team / project workspace — giữ chat|voice|tasks|documents. */
export const TEAM_WORKSPACE_TAB_VALUES = ['chat', 'voice', 'tasks', 'documents'];

export function normalizeWorkspaceTab(value, { departmentMode = false } = {}) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (departmentMode) {
    if (v === 'chat' || v === 'voice') return 'announcement';
    if (DEPT_WORKSPACE_TAB_VALUES.includes(v)) return v;
    return 'announcement';
  }
  if (WORKSPACE_TAB_VALUES.includes(v)) return v;
  return 'chat';
}

export function isWorkspaceAuxTab(tab) {
  return (
    tab === 'tasks' ||
    tab === 'documents' ||
    tab === 'notifications' ||
    tab === 'members' ||
    tab === 'calendar' ||
    tab === 'meetings'
  );
}

export function isDeptWorkspaceTab(tab) {
  return DEPT_WORKSPACE_TAB_VALUES.includes(String(tab || '').toLowerCase());
}
