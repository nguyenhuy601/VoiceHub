/** Cấu hình menu Quản trị công ty — tách khỏi menu nhân viên (collaborate). */

export const ADMIN_SUITE_COLOR = '#EF4444';

export const ADMIN_SECTIONS = [
  {
    id: 'personnel',
    labelKey: 'companyAdmin.navSectionPersonnel',
    items: [
      { id: 'overview', path: '/app/admin', labelKey: 'companyAdmin.tabOverview', end: true },
      { id: 'people', path: '/app/admin/people', labelKey: 'companyAdmin.tabPeople' },
      { id: 'approvals', path: '/app/admin/approvals', labelKey: 'companyAdmin.tabApprovals', badgeKey: 'pendingJoin' },
    ],
  },
  {
    id: 'configuration',
    labelKey: 'companyAdmin.navSectionConfiguration',
    adminOnly: true,
    items: [
      { id: 'general', path: '/app/admin/general', labelKey: 'companyAdmin.tabGeneral', settingsTab: 'general' },
      { id: 'structure', path: '/app/admin/structure', labelKey: 'companyAdmin.tabStructure', settingsTab: 'structure' },
      { id: 'roles', path: '/app/admin/roles', labelKey: 'companyAdmin.tabRoles', settingsTab: 'roles' },
      { id: 'policy', path: '/app/admin/policy', labelKey: 'companyAdmin.tabPolicy', settingsTab: 'join' },
      { id: 'security', path: '/app/admin/security', labelKey: 'companyAdmin.tabSecurity', settingsTab: 'security' },
    ],
  },
];

/** Map tab cũ (?tab=) sang path mới. */
export const LEGACY_ADMIN_TAB_TO_PATH = {
  overview: '/app/admin',
  people: '/app/admin/people',
  approvals: '/app/admin/approvals',
  general: '/app/admin/general',
  structure: '/app/admin/structure',
  roles: '/app/admin/roles',
  policy: '/app/admin/policy',
  join: '/app/admin/policy',
  security: '/app/admin/security',
};

export function resolveAdminSectionFromPath(pathname) {
  const base = String(pathname || '').replace(/\/+$/, '');
  if (base === '/app/admin') return 'overview';
  const match = base.match(/^\/app\/admin\/([^/]+)$/);
  return match ? match[1] : 'overview';
}

export function adminSettingsEmbedTab(section) {
  for (const group of ADMIN_SECTIONS) {
    const item = group.items.find((i) => i.id === section);
    if (item?.settingsTab) return item.settingsTab;
  }
  return null;
}
